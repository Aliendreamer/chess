using System.Text.Json;
using Confluent.Kafka;

namespace Chess.Engine;

/// <summary>The play topics (engine-play D1). <c>analysis.*</c> is Part 4's.</summary>
internal static class EngineTopics
{
    public const string Requests = "engine.moves.requests";
    public const string Results = "engine.moves.results";
}

/// <summary>A move to find: the engine plays <see cref="Ply"/> (the game's ply count before its move) in <see cref="Fen"/>.</summary>
internal sealed record MoveRequest(string GameId, int Ply, string Fen, string Level, int ThinkMs, DateTimeOffset RequestedAt);

/// <summary>The engine's answer; the backend applies it as a move by the level's engine player.</summary>
internal sealed record MoveResult(string GameId, int Ply, string Uci, string Level);

/// <summary>Section <c>Engine</c>.</summary>
internal sealed class EngineOptions
{
    public const string SectionName = "Engine";

    /// <summary>Stockfish processes, each with its own Kafka consumer; more than the topic's partitions (3) never helps.</summary>
    public int Processes { get; set; } = 1;

    public string StockfishPath { get; set; } = "/opt/stockfish/stockfish";

    public int HashMb { get; set; } = 32;

    /// <summary>How much longer than the move time a search may take before the process counts as hung.</summary>
    public int SlackSeconds { get; set; } = 10;

    /// <summary>Requests older than this are dropped: the game has asked again (its stall timer) or moved on.</summary>
    public int MaxRequestAgeSeconds { get; set; } = 120;

    /// <summary>The longest think a request may ask for.</summary>
    public int MaxThinkMs { get; set; } = 60_000;

    public void Validate()
    {
        Require(Processes is >= 1 and <= 16, "Engine:Processes must be 1–16.");
        Require(!string.IsNullOrWhiteSpace(StockfishPath), "Engine:StockfishPath is required.");
        Require(HashMb is >= 1 and <= 4096, "Engine:HashMb must be 1–4096.");
        Require(SlackSeconds > 0, "Engine:SlackSeconds must be positive.");
        Require(MaxRequestAgeSeconds > 0, "Engine:MaxRequestAgeSeconds must be positive.");
        Require(MaxThinkMs > 0, "Engine:MaxThinkMs must be positive.");
    }

    internal static void Require(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException(message);
        }
    }
}

/// <summary>Section <c>Kafka</c>.</summary>
internal sealed class KafkaOptions
{
    public const string SectionName = "Kafka";

    public string BootstrapServers { get; set; } = string.Empty;

    public string GroupId { get; set; } = "chess.engine-moves";

    /// <summary>Pause after a broker error before reading again.</summary>
    public int RetrySeconds { get; set; } = 5;

    public void Validate()
    {
        EngineOptions.Require(!string.IsNullOrWhiteSpace(BootstrapServers), "Kafka:BootstrapServers is required.");
        EngineOptions.Require(!string.IsNullOrWhiteSpace(GroupId), "Kafka:GroupId is required.");
        EngineOptions.Require(RetrySeconds > 0, "Kafka:RetrySeconds must be positive.");
    }
}

/// <summary>
/// One request in, at most one result out, for one engine process. Unreadable, stale or out-of-range requests are
/// dropped. A failing engine (hung or exited) is replaced and the search tried once more; after that the request is
/// dropped, and the game's stall timer asks again (engine-play D1, D6).
/// </summary>
internal sealed class MoveHandler(
    Func<CancellationToken, Task<UciEngine>> startEngine,
    EngineOptions options,
    TimeProvider clock,
    ILogger logger) : IAsyncDisposable
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private UciEngine? _engine;

    public async Task<MoveResult?> HandleAsync(string json, CancellationToken ct)
    {
        MoveRequest? request = Parse(json);
        if (request is null || string.IsNullOrWhiteSpace(request.GameId) || string.IsNullOrWhiteSpace(request.Fen))
        {
            Log.RequestUnreadable(logger);
            return null;
        }

        if (!EngineLevel.TryParse(request.Level, out EngineLevel level) || request.ThinkMs <= 0 || request.ThinkMs > options.MaxThinkMs)
        {
            Log.RequestRefused(logger, request.GameId, request.Ply, request.Level, request.ThinkMs);
            return null;
        }

        TimeSpan age = clock.GetUtcNow() - request.RequestedAt;
        if (age > TimeSpan.FromSeconds(options.MaxRequestAgeSeconds))
        {
            long ageSeconds = (long)age.TotalSeconds;
            Log.RequestStale(logger, request.GameId, request.Ply, ageSeconds);
            return null;
        }

        for (int attempt = 1; ; attempt++)
        {
            try
            {
                UciEngine engine = await EnsureEngineAsync(ct).ConfigureAwait(false);
                string? uci = await engine.BestMoveAsync(request.Fen, level, request.ThinkMs, ct).ConfigureAwait(false);
                if (uci is null)
                {
                    Log.NoMove(logger, request.GameId, request.Ply);
                    return null;
                }

                string levelName = level.ToString();
                Log.Moved(logger, request.GameId, request.Ply, uci, levelName);
                return new MoveResult(request.GameId, request.Ply, uci, levelName);
            }
            catch (Exception e) when (e is TimeoutException or EndOfStreamException or IOException or InvalidOperationException
                or System.ComponentModel.Win32Exception)
            {
                await DiscardEngineAsync().ConfigureAwait(false);
                if (attempt >= 2)
                {
                    Log.EngineGaveUp(logger, e, request.GameId, request.Ply);
                    return null;
                }

                Log.EngineRestarting(logger, e, request.GameId, request.Ply);
            }
        }
    }

    public ValueTask DisposeAsync() => new(DiscardEngineAsync());

    private static MoveRequest? Parse(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<MoveRequest>(json, Json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private async Task<UciEngine> EnsureEngineAsync(CancellationToken ct)
    {
        if (_engine is { IsAlive: true })
        {
            return _engine;
        }

        await DiscardEngineAsync().ConfigureAwait(false);
        _engine = await startEngine(ct).ConfigureAwait(false);
        return _engine;
    }

    private async Task DiscardEngineAsync()
    {
        if (_engine is not null)
        {
            UciEngine engine = _engine;
            _engine = null;
            await engine.DisposeAsync().ConfigureAwait(false);
        }
    }
}

/// <summary>
/// <see cref="EngineOptions.Processes"/> loops, each with its own consumer in the group and its own engine, so the
/// topic's partitions spread over them. A request is committed only after its result is produced (at-least-once);
/// a broker error rewinds to the request and reads it again after a pause.
/// </summary>
internal sealed class MoveWorker(EngineOptions engine, KafkaOptions kafka, TimeProvider clock, ILogger<MoveWorker> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using IProducer<string, string> producer = new ProducerBuilder<string, string>(new ProducerConfig
        {
            BootstrapServers = kafka.BootstrapServers,
            Acks = Acks.All,
            EnableIdempotence = true,
        }).Build();

        Log.WorkerStarted(logger, engine.Processes, EngineTopics.Requests);
        Task[] loops = [.. Enumerable.Range(0, engine.Processes).Select(n => Task.Factory.StartNew(
            () => LoopAsync(n, producer, stoppingToken),
            stoppingToken,
            TaskCreationOptions.LongRunning,
            TaskScheduler.Default).Unwrap())];
        await Task.WhenAll(loops).ConfigureAwait(false);
        producer.Flush(TimeSpan.FromSeconds(5));
    }

    private async Task LoopAsync(int n, IProducer<string, string> producer, CancellationToken ct)
    {
        using IConsumer<string, string> consumer = new ConsumerBuilder<string, string>(new ConsumerConfig
        {
            BootstrapServers = kafka.BootstrapServers,
            GroupId = kafka.GroupId,
            EnableAutoCommit = false,
            AutoOffsetReset = AutoOffsetReset.Earliest,
            ClientId = $"chess-engine-{n}",
        }).Build();
        consumer.Subscribe(EngineTopics.Requests);
        MoveHandler handler = new(StartEngineAsync, engine, clock, logger);
        await using (handler.ConfigureAwait(false))
        {
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    await StepAsync(consumer, producer, handler, ct).ConfigureAwait(false);
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                // SIGTERM: stop reading; the uncommitted request is read again by whoever takes the partition.
            }
            finally
            {
                consumer.Close();
            }
        }
    }

    private async Task StepAsync(IConsumer<string, string> consumer, IProducer<string, string> producer, MoveHandler handler, CancellationToken ct)
    {
        ConsumeResult<string, string>? record = null;
        try
        {
            record = consumer.Consume(ct);
            MoveResult? result = await handler.HandleAsync(record.Message.Value, ct).ConfigureAwait(false);
            if (result is not null)
            {
                await producer.ProduceAsync(
                    EngineTopics.Results,
                    new Message<string, string> { Key = result.GameId, Value = JsonSerializer.Serialize(result, MoveHandler.Json) },
                    ct).ConfigureAwait(false);
            }

            consumer.Commit(record);
        }
        catch (KafkaException e)
        {
            Log.KafkaFailed(logger, e);
            if (record is not null)
            {
                consumer.Seek(record.TopicPartitionOffset);
            }

            await Task.Delay(TimeSpan.FromSeconds(kafka.RetrySeconds), ct).ConfigureAwait(false);
        }
    }

    private async Task<UciEngine> StartEngineAsync(CancellationToken ct)
    {
        UciEngine started = new(StockfishProcess.Start(engine.StockfishPath), engine.HashMb, TimeSpan.FromSeconds(engine.SlackSeconds));
        await started.InitializeAsync(ct).ConfigureAwait(false);
        Log.EngineStarted(logger, engine.StockfishPath);
        return started;
    }
}
