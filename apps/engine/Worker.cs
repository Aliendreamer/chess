using System.Text.Json;
using Confluent.Kafka;

namespace Chess.Engine;

/// <summary>
/// The topics the worker serves: moves for games against the computer (engine-play D1) and position analysis
/// (engine-analysis D3). Each has its own consumer group and processes, so analysis never delays a move.
/// The backend cannot share this code: its <c>EngineTopics</c> and <c>AnalysisTopics</c> must spell them the same
/// (pinned in its <c>WireNamesTests</c>).
/// </summary>
internal static class EngineTopics
{
    public const string Requests = "engine.moves.requests";
    public const string Results = "engine.moves.results";
    public const string AnalysisRequests = "analysis.requests";
    public const string AnalysisResults = "analysis.results";
}

/// <summary>A move to find: the engine plays <see cref="Ply"/> (the game's ply count before its move) in <see cref="Fen"/>.</summary>
internal sealed record MoveRequest(string GameId, int Ply, string Fen, string Level, int ThinkMs, DateTimeOffset RequestedAt);

/// <summary>The engine's answer; the backend applies it as a move by the level's engine player.</summary>
internal sealed record MoveResult(string GameId, int Ply, string Uci, string Level);

/// <summary>A position to analyse (engine-analysis D2): <see cref="Key"/> is the backend's cache key for it.</summary>
internal sealed record AnalysisRequest(string Key, string Fen, int ThinkMs, int MultiPv, DateTimeOffset RequestedAt);

/// <summary>The analysis: the depth reached and the best lines, scored from White's side.</summary>
internal sealed record AnalysisResult(string Key, string Fen, int ThinkMs, int Depth, IReadOnlyList<AnalysisLine> Lines);

/// <summary>Section <c>Engine</c>.</summary>
internal sealed class EngineOptions
{
    public const string SectionName = "Engine";

    /// <summary>Stockfish processes for moves, each with its own Kafka consumer; more than the topic's partitions (3) never helps.</summary>
    public int Processes { get; set; } = 1;

    /// <summary>Stockfish processes for analysis, apart from the move ones so analysis never delays a game.</summary>
    public int AnalysisProcesses { get; set; } = 1;

    public string StockfishPath { get; set; } = "/opt/stockfish/stockfish";

    public int HashMb { get; set; } = 32;

    /// <summary>How much longer than the move time a search may take before the process counts as hung.</summary>
    public int SlackSeconds { get; set; } = 10;

    /// <summary>Requests older than this are dropped: the asker has asked again (a stall or a retry) or moved on.</summary>
    public int MaxRequestAgeSeconds { get; set; } = 120;

    /// <summary>The longest think a request may ask for.</summary>
    public int MaxThinkMs { get; set; } = 60_000;

    public void Validate()
    {
        Require(Processes is >= 1 and <= 16, "Engine:Processes must be 1–16.");
        Require(AnalysisProcesses is >= 0 and <= 16, "Engine:AnalysisProcesses must be 0–16.");
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

    public string AnalysisGroupId { get; set; } = "chess.engine-analysis";

    /// <summary>Pause after a broker error before reading again.</summary>
    public int RetrySeconds { get; set; } = 5;

    public void Validate()
    {
        EngineOptions.Require(!string.IsNullOrWhiteSpace(BootstrapServers), "Kafka:BootstrapServers is required.");
        EngineOptions.Require(!string.IsNullOrWhiteSpace(GroupId), "Kafka:GroupId is required.");
        EngineOptions.Require(!string.IsNullOrWhiteSpace(AnalysisGroupId), "Kafka:AnalysisGroupId is required.");
        EngineOptions.Require(RetrySeconds > 0, "Kafka:RetrySeconds must be positive.");
    }
}

/// <summary>
/// One engine process and its lifecycle, shared by both kinds of job: started on first use, replaced when it hangs or
/// exits, and a failed search tried once more on a fresh one; after that the job is dropped (the asker asks again).
/// </summary>
internal sealed class EngineSession(JobKind kind, Func<CancellationToken, Task<UciEngine>> startEngine, ILogger logger) : IAsyncDisposable
{
    private UciEngine? _engine;

    public async Task<T?> RunAsync<T>(string job, Func<UciEngine, Task<T?>> search, CancellationToken ct)
        where T : class
    {
        ArgumentNullException.ThrowIfNull(search);
        for (int attempt = 1; ; attempt++)
        {
            try
            {
                return await search(await EnsureEngineAsync(ct).ConfigureAwait(false)).ConfigureAwait(false);
            }
            catch (Exception e) when (e is TimeoutException or EndOfStreamException or IOException or InvalidOperationException
                or System.ComponentModel.Win32Exception)
            {
                await DiscardAsync().ConfigureAwait(false);
                if (attempt >= 2)
                {
                    Log.EngineGaveUp(logger, e, job);
                    return null;
                }

                Log.EngineRestarting(logger, e, job);
                EngineTelemetry.Restarted(kind);
            }
        }
    }

    public ValueTask DisposeAsync() => new(DiscardAsync());

    private async Task<UciEngine> EnsureEngineAsync(CancellationToken ct)
    {
        if (_engine is { IsAlive: true })
        {
            return _engine;
        }

        await DiscardAsync().ConfigureAwait(false);
        _engine = await startEngine(ct).ConfigureAwait(false);
        return _engine;
    }

    private async Task DiscardAsync()
    {
        if (_engine is not null)
        {
            UciEngine engine = _engine;
            _engine = null;
            await engine.DisposeAsync().ConfigureAwait(false);
        }
    }
}

/// <summary>Reads a request, or null when it is not one (a poison message is dropped, never retried).</summary>
internal static class Requests
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static T? Parse<T>(string json)
        where T : class
    {
        try
        {
            return JsonSerializer.Deserialize<T>(json, Json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static bool Stale(DateTimeOffset requestedAt, TimeProvider clock, EngineOptions options, out long ageSeconds)
    {
        TimeSpan age = clock.GetUtcNow() - requestedAt;
        ageSeconds = (long)age.TotalSeconds;
        return age > TimeSpan.FromSeconds(options.MaxRequestAgeSeconds);
    }
}

/// <summary>
/// One move request in, at most one result out (engine-play D1). Unreadable, stale or out-of-range requests are
/// dropped; a failing engine is replaced and the search tried once more, and after that the game's stall timer asks again.
/// </summary>
internal sealed class MoveHandler(
    Func<CancellationToken, Task<UciEngine>> startEngine,
    EngineOptions options,
    TimeProvider clock,
    ILogger logger) : IAsyncDisposable
{
    internal static readonly JsonSerializerOptions Json = Requests.Json;

    private readonly EngineSession _session = new(JobKind.Move, startEngine, logger);

    public async Task<MoveResult?> HandleAsync(string json, CancellationToken ct)
    {
        MoveRequest? request = Requests.Parse<MoveRequest>(json);
        if (request is null || string.IsNullOrWhiteSpace(request.GameId) || string.IsNullOrWhiteSpace(request.Fen))
        {
            Log.RequestUnreadable(logger);
            EngineTelemetry.DroppedRequest(JobKind.Move, DropReason.Unreadable);
            return null;
        }

        string job = $"{request.GameId}#{request.Ply}";
        if (!EngineLevel.TryParse(request.Level, out EngineLevel level) || request.ThinkMs <= 0 || request.ThinkMs > options.MaxThinkMs)
        {
            Log.RequestRefused(logger, job, request.Level, request.ThinkMs);
            EngineTelemetry.DroppedRequest(JobKind.Move, DropReason.Refused);
            return null;
        }

        if (Requests.Stale(request.RequestedAt, clock, options, out long ageSeconds))
        {
            Log.RequestStale(logger, job, ageSeconds);
            EngineTelemetry.DroppedRequest(JobKind.Move, DropReason.Stale);
            return null;
        }

        return await _session.RunAsync(job, async engine =>
        {
            string? uci = await engine.BestMoveAsync(request.Fen, level, request.ThinkMs, ct).ConfigureAwait(false);
            if (uci is null)
            {
                Log.NoMove(logger, job);
                return null;
            }

            string levelName = level.ToString();
            Log.Moved(logger, job, uci, levelName);
            return new MoveResult(request.GameId, request.Ply, uci, levelName);
        }, ct).ConfigureAwait(false);
    }

    public ValueTask DisposeAsync() => _session.DisposeAsync();
}

/// <summary>
/// One analysis request in, at most one result out (engine-analysis D3): full strength, the asked number of lines, the
/// asked think time. Same failure rules as moves; a dropped request is asked again by the backend after its retry time.
/// </summary>
internal sealed class AnalysisHandler(
    Func<CancellationToken, Task<UciEngine>> startEngine,
    EngineOptions options,
    TimeProvider clock,
    ILogger logger) : IAsyncDisposable
{
    public const int MaxLines = 5;

    private readonly EngineSession _session = new(JobKind.Analysis, startEngine, logger);

    public async Task<AnalysisResult?> HandleAsync(string json, CancellationToken ct)
    {
        AnalysisRequest? request = Requests.Parse<AnalysisRequest>(json);
        if (request is null || string.IsNullOrWhiteSpace(request.Key) || string.IsNullOrWhiteSpace(request.Fen))
        {
            Log.RequestUnreadable(logger);
            EngineTelemetry.DroppedRequest(JobKind.Analysis, DropReason.Unreadable);
            return null;
        }

        string job = $"analysis {request.Key} {request.ThinkMs}ms";
        if (request.ThinkMs <= 0 || request.ThinkMs > options.MaxThinkMs || request.MultiPv is < 1 or > MaxLines)
        {
            Log.RequestRefused(logger, job, $"{request.MultiPv} lines", request.ThinkMs);
            EngineTelemetry.DroppedRequest(JobKind.Analysis, DropReason.Refused);
            return null;
        }

        if (Requests.Stale(request.RequestedAt, clock, options, out long ageSeconds))
        {
            Log.RequestStale(logger, job, ageSeconds);
            EngineTelemetry.DroppedRequest(JobKind.Analysis, DropReason.Stale);
            return null;
        }

        return await _session.RunAsync(job, async engine =>
        {
            (int depth, IReadOnlyList<AnalysisLine> lines) = await engine.AnalyseAsync(request.Fen, request.ThinkMs, request.MultiPv, ct).ConfigureAwait(false);
            Log.Analysed(logger, job, depth, lines.Count);
            return new AnalysisResult(request.Key, request.Fen, request.ThinkMs, depth, lines);
        }, ct).ConfigureAwait(false);
    }

    public ValueTask DisposeAsync() => _session.DisposeAsync();
}

/// <summary>
/// The worker's loops: <see cref="EngineOptions.Processes"/> for moves and <see cref="EngineOptions.AnalysisProcesses"/>
/// for analysis, each with its own consumer and engine, so a topic's partitions spread over them. A request is
/// committed only after its result is produced (at-least-once); a broker error rewinds to it and reads it again.
/// </summary>
internal sealed class EngineWorker(EngineOptions engine, KafkaOptions kafka, TimeProvider clock, ILogger<EngineWorker> logger)
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
        Log.WorkerStarted(logger, engine.AnalysisProcesses, EngineTopics.AnalysisRequests);
        IEnumerable<Task> moves = Enumerable.Range(0, engine.Processes).Select(n => Loop(
            JobKind.Move, $"chess-engine-move-{n}", EngineTopics.Requests, kafka.GroupId, producer, () =>
            {
                MoveHandler handler = new(StartEngineAsync, engine, clock, logger);
                return (async (json, ct) => await handler.HandleAsync(json, ct).ConfigureAwait(false) is { } r
                    ? new Message<string, string> { Key = r.GameId, Value = JsonSerializer.Serialize(r, Requests.Json) }
                    : null, handler, EngineTopics.Results);
            }, stoppingToken));
        IEnumerable<Task> analysis = Enumerable.Range(0, engine.AnalysisProcesses).Select(n => Loop(
            JobKind.Analysis, $"chess-engine-analysis-{n}", EngineTopics.AnalysisRequests, kafka.AnalysisGroupId, producer, () =>
            {
                AnalysisHandler handler = new(StartEngineAsync, engine, clock, logger);
                return (async (json, ct) => await handler.HandleAsync(json, ct).ConfigureAwait(false) is { } r
                    ? new Message<string, string> { Key = r.Key, Value = JsonSerializer.Serialize(r, Requests.Json) }
                    : null, handler, EngineTopics.AnalysisResults);
            }, stoppingToken));
        await Task.WhenAll(moves.Concat(analysis)).ConfigureAwait(false);
        producer.Flush(TimeSpan.FromSeconds(5));
    }

    private Task Loop(
        JobKind kind,
        string clientId,
        string topic,
        string groupId,
        IProducer<string, string> producer,
        Func<(Func<string, CancellationToken, Task<Message<string, string>?>> Handle, IAsyncDisposable Owner, string ResultTopic)> create,
        CancellationToken ct) =>
        Task.Factory.StartNew(
            async () =>
            {
                (Func<string, CancellationToken, Task<Message<string, string>?>> handle, IAsyncDisposable owner, string resultTopic) = create();
                using IConsumer<string, string> consumer = new ConsumerBuilder<string, string>(new ConsumerConfig
                {
                    BootstrapServers = kafka.BootstrapServers,
                    GroupId = groupId,
                    EnableAutoCommit = false,
                    AutoOffsetReset = AutoOffsetReset.Earliest,
                    ClientId = clientId,
                }).Build();
                consumer.Subscribe(topic);
                await using (owner.ConfigureAwait(false))
                {
                    try
                    {
                        while (!ct.IsCancellationRequested)
                        {
                            await StepAsync(kind, consumer, producer, handle, resultTopic, ct).ConfigureAwait(false);
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
            },
            ct,
            TaskCreationOptions.LongRunning,
            TaskScheduler.Default).Unwrap();

    private async Task StepAsync(
        JobKind kind,
        IConsumer<string, string> consumer,
        IProducer<string, string> producer,
        Func<string, CancellationToken, Task<Message<string, string>?>> handle,
        string resultTopic,
        CancellationToken ct)
    {
        ConsumeResult<string, string>? record = null;
        try
        {
            record = consumer.Consume(ct);
            if (await EngineTelemetry.ProcessAsync(kind, record.Message, handle, ct).ConfigureAwait(false) is { } result)
            {
                await producer.ProduceAsync(resultTopic, result, ct).ConfigureAwait(false);
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
