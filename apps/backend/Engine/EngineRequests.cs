using System.Text.Json;
using System.Text.Json.Serialization;
using Chess.Backend.Akka;
using Chess.Backend.Extensions;
using Confluent.Kafka;

namespace Chess.Backend.Engine;

/// <summary>The play topics the engine worker (<c>apps/engine</c>) reads and answers on (engine-play D1).</summary>
internal static class EngineTopics
{
    public const string Requests = "engine.moves.requests";
    public const string Results = "engine.moves.results";
}

/// <summary>Section <c>Engine</c>: how long the engine thinks, and how long a game waits before asking again.</summary>
internal sealed class EngineOptions : ISettings
{
    public const string SectionName = "Engine";

    /// <summary>Each move's think time is drawn from <see cref="MinThinkMs"/>–<see cref="MaxThinkMs"/> (owner decision: 5–10 s).</summary>
    public int MinThinkMs { get; set; } = 5_000;

    public int MaxThinkMs { get; set; } = 10_000;

    /// <summary>With the engine to move and no move for this long, the game asks again (a request was lost).</summary>
    public int StallSeconds { get; set; } = 60;

    public TimeSpan Stall => TimeSpan.FromSeconds(StallSeconds);

    public void Validate()
    {
        if (MinThinkMs <= 0 || MaxThinkMs < MinThinkMs)
        {
            throw new InvalidOperationException("Engine:MinThinkMs must be positive and Engine:MaxThinkMs at least as large.");
        }

        if (StallSeconds * 1_000L <= MaxThinkMs)
        {
            throw new InvalidOperationException("Engine:StallSeconds must be longer than Engine:MaxThinkMs.");
        }
    }
}

/// <summary>
/// What the worker reads: the engine plays <see cref="Ply"/> (the game's ply count before its move) in
/// <see cref="Fen"/> at <see cref="Level"/> ("1320"…"2400" or "max"), thinking <see cref="ThinkMs"/>.
/// </summary>
internal sealed record EngineMoveRequest(
    [property: JsonPropertyName("gameId")] string GameId,
    [property: JsonPropertyName("ply")] int Ply,
    [property: JsonPropertyName("fen")] string Fen,
    [property: JsonPropertyName("level")] string Level,
    [property: JsonPropertyName("thinkMs")] int ThinkMs,
    [property: JsonPropertyName("requestedAt")] DateTimeOffset RequestedAt);

/// <summary>The worker's answer: the engine's move at <see cref="Ply"/>.</summary>
internal sealed record EngineMoveResult(
    [property: JsonPropertyName("gameId")] string GameId,
    [property: JsonPropertyName("ply")] int Ply,
    [property: JsonPropertyName("uci")] string Uci,
    [property: JsonPropertyName("level")] string Level);

/// <summary>Asks the engine for a move. A duplicate request is harmless: the game takes one move per ply.</summary>
internal interface IEngineRequests
{
    /// <summary>For the request consumer: waits for Kafka's ack.</summary>
    Task RequestAsync(Guid gameId, int ply, string fen, string level, CancellationToken ct);

    /// <summary>
    /// For a game whose engine has not moved in time (engine-play D6): fire-and-forget, since an actor must not wait.
    /// A failure is only logged; the game's stall timer asks again.
    /// </summary>
    void Nudge(Guid gameId, int ply, string fen, string level);
}

/// <summary>
/// Produces requests to <see cref="EngineTopics.Requests"/>, keyed by game so one game's requests stay in order. Owns its
/// producer, like the journal publisher: no general-purpose producer is registered, so nothing else can produce.
/// </summary>
internal sealed class KafkaEngineRequests(IProducer<string, string> producer, EngineOptions options, TimeProvider clock, ILogger<KafkaEngineRequests> logger)
    : IEngineRequests, IDisposable
{
    public static KafkaEngineRequests Create(string bootstrapServers, EngineOptions options, TimeProvider clock, ILogger<KafkaEngineRequests> logger) =>
        new(new ProducerBuilder<string, string>(new ProducerConfig
        {
            BootstrapServers = bootstrapServers,
            Acks = Acks.All,
            EnableIdempotence = true,
        }).Build(), options, clock, logger);

    public void Dispose()
    {
        producer.Flush(TimeSpan.FromSeconds(5));
        producer.Dispose();
    }

    public Task RequestAsync(Guid gameId, int ply, string fen, string level, CancellationToken ct) =>
        producer.ProduceAsync(EngineTopics.Requests, Message(gameId, ply, fen, level), ct);

    public void Nudge(Guid gameId, int ply, string fen, string level)
    {
        Utils.Log.EngineNudged(logger, gameId, ply);
        producer.Produce(EngineTopics.Requests, Message(gameId, ply, fen, level), report =>
        {
            if (report.Error.IsError)
            {
                Utils.Log.EngineNudgeFailed(logger, gameId, ply, report.Error.Reason);
            }
        });
    }

    internal Message<string, string> Message(Guid gameId, int ply, string fen, string level)
    {
        // Uniform over [min, max]: a human-feeling pause, whatever the strength (the engine uses all of it).
        int thinkMs = Random.Shared.Next(options.MinThinkMs, options.MaxThinkMs + 1);
        EngineMoveRequest request = new(gameId.ToString("N"), ply, fen, level, thinkMs, clock.GetUtcNow());
        return new Message<string, string> { Key = request.GameId, Value = JsonSerializer.Serialize(request), Headers = PipelineTracing.CurrentHeaders() };
    }
}

/// <summary>Without Kafka (unit tests, a bare run) there is no engine to ask.</summary>
internal sealed class NoEngineRequests : IEngineRequests
{
    public static readonly NoEngineRequests Instance = new();

    public Task RequestAsync(Guid gameId, int ply, string fen, string level, CancellationToken ct) => Task.CompletedTask;

    public void Nudge(Guid gameId, int ply, string fen, string level)
    {
    }
}
