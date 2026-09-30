using System.Text.Json;
using System.Text.Json.Serialization;
using Chess.Backend.Akka;
using Chess.Backend.Extensions;
using Chess.Backend.Games;
using Chess.Backend.Projections;
using Confluent.Kafka;

namespace Chess.Backend.Analysis;

/// <summary>Section <c>Analysis</c> (engine-analysis): the think times, the lines per position and the retry time.</summary>
internal sealed class AnalysisOptions : ISettings
{
    public const string SectionName = "Analysis";

    public int QuickMs { get; set; } = 1_000;

    public int NormalMs { get; set; } = 3_000;

    public int DeepMs { get; set; } = 10_000;

    /// <summary>The engine's best lines per position (MultiPV).</summary>
    public int Lines { get; set; } = 3;

    /// <summary>A request unanswered for this long counts as lost and is sent again when someone asks.</summary>
    public int RetryAfterSeconds { get; set; } = 120;

    /// <summary>The think time of <c>quick</c>, <c>normal</c> or <c>deep</c>; null for anything else.</summary>
    public int? ThinkMs(string? think) => think switch
    {
        "quick" => QuickMs,
        "normal" => NormalMs,
        "deep" => DeepMs,
        _ => null,
    };

    public void Validate()
    {
        if (QuickMs <= 0 || NormalMs < QuickMs || DeepMs < NormalMs)
        {
            throw new InvalidOperationException("Analysis:QuickMs, NormalMs and DeepMs must be positive and rising.");
        }

        if (Lines is < 1 or > 5 || RetryAfterSeconds <= 0)
        {
            throw new InvalidOperationException("Analysis:Lines must be 1–5, and Analysis:RetryAfterSeconds positive.");
        }
    }
}

/// <summary>
/// The cache key of a position (engine-analysis D1): placement, side, castling and en passant — the move counters do
/// not change an evaluation. An en-passant square is kept only when a pawn can take there, so the FENs our rules
/// library and chess.js write for the same position share a key.
/// </summary>
internal static class PositionKey
{
    public static string? Of(string fen)
    {
        string[] f = (fen ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (f.Length < 4 || ChessRules.ForStudy(fen!) is null)
        {
            return null;
        }

        string ep = f[3] != "-" && CanTakeEnPassant(f[0], f[1], f[3]) ? f[3] : "-";
        return string.Join(' ', f[0], f[1], f[2], ep);
    }

    /// <summary>Whether a pawn of the side to move stands beside the pawn that just moved two squares.</summary>
    private static bool CanTakeEnPassant(string placement, string side, string square)
    {
        if (square.Length != 2)
        {
            return false;
        }

        int file = square[0] - 'a';
        int rank = side == "w" ? 5 : 4; // the capturing pawn's rank, 1-based: White takes from the 5th, Black from the 4th
        char pawn = side == "w" ? 'P' : 'p';
        string[] rows = placement.Split('/');
        if (rows.Length != 8)
        {
            return false;
        }

        string row = rows[8 - rank];
        List<char> squares = [];
        foreach (char c in row)
        {
            if (char.IsAsciiDigit(c))
            {
                squares.AddRange(Enumerable.Repeat('.', c - '0'));
            }
            else
            {
                squares.Add(c);
            }
        }

        return (file > 0 && squares.ElementAtOrDefault(file - 1) == pawn) || (file < 7 && squares.ElementAtOrDefault(file + 1) == pawn);
    }
}

/// <summary>One of the engine's lines, scored from White's side: centipawns, or mate in N (negative when Black mates).</summary>
internal sealed record EvaluationLine(
    [property: JsonPropertyName("cp")] int? Cp,
    [property: JsonPropertyName("mate")] int? Mate,
    [property: JsonPropertyName("pv")] IReadOnlyList<string> Pv);

/// <summary>A finished evaluation, as the API answers it.</summary>
internal sealed record Evaluation(int ThinkMs, int Depth, IReadOnlyList<EvaluationLine> Lines);

/// <summary>The position asked about, and its evaluation when one good enough is known.</summary>
internal sealed record PositionAnswer(string Key, string Fen, Evaluation? Evaluation);

/// <summary>What the worker reads on <c>analysis.requests</c>.</summary>
internal sealed record AnalysisRequestMessage(
    [property: JsonPropertyName("key")] string Key,
    [property: JsonPropertyName("fen")] string Fen,
    [property: JsonPropertyName("thinkMs")] int ThinkMs,
    [property: JsonPropertyName("multiPv")] int MultiPv,
    [property: JsonPropertyName("requestedAt")] DateTimeOffset RequestedAt);

/// <summary>What the worker answers on <c>analysis.results</c>.</summary>
internal sealed record AnalysisResultMessage(
    [property: JsonPropertyName("key")] string Key,
    [property: JsonPropertyName("fen")] string Fen,
    [property: JsonPropertyName("thinkMs")] int ThinkMs,
    [property: JsonPropertyName("depth")] int Depth,
    [property: JsonPropertyName("lines")] IReadOnlyList<EvaluationLine> Lines);

/// <summary>Sends a position to the engine worker. A duplicate is harmless: the result is stored once per key and think.</summary>
internal interface IAnalysisRequests
{
    Task RequestAsync(AnalysisRequestMessage request, CancellationToken ct);
}

/// <summary>Produces to <c>analysis.requests</c>, keyed by position. Owns its producer: nothing else may produce.</summary>
[ExcludeFromCodeCoverage(Justification = "A Kafka producer; exercised by the integration and live checks.")]
internal sealed class KafkaAnalysisRequests(string bootstrapServers) : IAnalysisRequests, IDisposable
{
    public const string Topic = "analysis.requests";

    private readonly IProducer<string, string> _producer = new ProducerBuilder<string, string>(new ProducerConfig
    {
        BootstrapServers = bootstrapServers,
        Acks = Acks.All,
        EnableIdempotence = true,
    }).Build();

    public Task RequestAsync(AnalysisRequestMessage request, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);
        return _producer.ProduceAsync(Topic, new Message<string, string> { Key = request.Key, Value = JsonSerializer.Serialize(request), Headers = PipelineTracing.CurrentHeaders() }, ct);
    }

    public void Dispose()
    {
        _producer.Flush(TimeSpan.FromSeconds(5));
        _producer.Dispose();
    }
}

/// <summary>Without Kafka there is no engine to ask; positions stay unanswered.</summary>
internal sealed class NoAnalysisRequests : IAnalysisRequests
{
    public static readonly NoAnalysisRequests Instance = new();

    public Task RequestAsync(AnalysisRequestMessage request, CancellationToken ct) => Task.CompletedTask;
}

internal interface IAnalysisService : IService
{
    /// <summary>Answers the position with the best known evaluation at <paramref name="thinkMs"/> or longer, or asks the engine for one.</summary>
    Task<PositionAnswer> AnalyseAsync(string fen, int thinkMs, CancellationToken ct);
}

/// <summary>
/// The shared evaluation cache (engine-analysis D1–D2): a position is evaluated once per think time and reused by
/// anyone, a longer think answers a shorter request, and a position already asked for is asked again only when its
/// request has gone stale (lost).
/// </summary>
internal sealed class AnalysisService(
    ProjectDbContext context,
    ILogger<AnalysisService> logger,
    IAnalysisRequests requests,
    IOptions<AnalysisOptions> options,
    TimeProvider clock) : BaseService(context, logger), IAnalysisService
{
    public async Task<PositionAnswer> AnalyseAsync(string fen, int thinkMs, CancellationToken ct)
    {
        string key = PositionKey.Of(fen) ?? throw new ArgumentException("Not a position (FEN).", nameof(fen));
        List<PositionEvaluation> known = await Context.PositionEvaluations
            .Where(e => e.PositionKey == key && e.ThinkMs >= thinkMs)
            .ToListAsync(ct);

        PositionEvaluation? best = known
            .Where(e => e.Status == PositionEvaluation.Done && e.Depth is not null && e.Lines is not null)
            .MaxBy(e => e.ThinkMs);
        if (best is not null)
        {
            return new PositionAnswer(key, fen, ToEvaluation(best));
        }

        DateTimeOffset now = clock.GetUtcNow();
        PositionEvaluation? pending = known.Find(e => e.ThinkMs == thinkMs);
        if (pending is not null && now - pending.RequestedAt < TimeSpan.FromSeconds(options.Value.RetryAfterSeconds))
        {
            return new PositionAnswer(key, fen, null); // being evaluated
        }

        if (pending is null)
        {
            Context.PositionEvaluations.Add(new PositionEvaluation { PositionKey = key, ThinkMs = thinkMs, Status = PositionEvaluation.Requested, RequestedAt = now });
        }
        else
        {
            pending.RequestedAt = now; // lost: ask again
        }

        await requests.RequestAsync(new AnalysisRequestMessage(key, fen, thinkMs, options.Value.Lines, now), ct);
        await Context.SaveChangesAsync(ct);
        return new PositionAnswer(key, fen, null);
    }

    internal static Evaluation ToEvaluation(PositionEvaluation e) =>
        new(e.ThinkMs, e.Depth ?? 0, JsonSerializer.Deserialize<List<EvaluationLine>>(e.Lines ?? "[]") ?? []);
}

/// <summary>
/// Stores the worker's answers from <c>analysis.results</c> (engine-analysis D4). A late or repeated answer only replaces
/// an evaluation of the same think time when it went at least as deep.
/// </summary>
internal sealed class AnalysisResultConsumer(ProjectDbContext db, TimeProvider clock) : IProjection
{
    public string Topic => "analysis.results";

    public string GroupId => "chess.analysis-results";

    public async Task<ProjectionOutcome> ApplyAsync(string key, string json, CancellationToken ct)
    {
        AnalysisResultMessage? result;
        try
        {
            result = JsonSerializer.Deserialize<AnalysisResultMessage>(json);
        }
        catch (JsonException)
        {
            return ProjectionOutcome.Ignored;
        }

        if (result is null || string.IsNullOrEmpty(result.Key) || result.Lines is null)
        {
            return ProjectionOutcome.Ignored;
        }

        PositionEvaluation? row = await db.PositionEvaluations.SingleOrDefaultAsync(e => e.PositionKey == result.Key && e.ThinkMs == result.ThinkMs, ct);
        if (row is null)
        {
            row = new PositionEvaluation { PositionKey = result.Key, ThinkMs = result.ThinkMs, Status = PositionEvaluation.Requested, RequestedAt = clock.GetUtcNow() };
            db.PositionEvaluations.Add(row);
        }
        else if (row.Status == PositionEvaluation.Done && row.Depth > result.Depth)
        {
            return ProjectionOutcome.Skipped; // a deeper answer is kept
        }

        row.Status = PositionEvaluation.Done;
        row.Depth = result.Depth;
        row.Lines = JsonSerializer.Serialize(result.Lines);
        row.EvaluatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        return ProjectionOutcome.Applied;
    }
}
