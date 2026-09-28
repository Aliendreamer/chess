namespace Chess.Backend.Data.Models;

/// <summary>
/// An evaluation of a position at a think time (engine-analysis D1), shared by everyone who asks: requested once, then
/// filled by the engine's answer. <see cref="PositionKey"/> is the FEN without its move counters.
/// </summary>
internal sealed class PositionEvaluation
{
    public const string Requested = "requested";
    public const string Done = "done";

    public required string PositionKey { get; set; }

    public int ThinkMs { get; set; }

    public required string Status { get; set; }

    public int? Depth { get; set; }

    /// <summary>The engine's best lines as JSON: <c>[{ cp, mate, pv: [uci…] }]</c>, scores from White's side.</summary>
    public string? Lines { get; set; }

    public DateTimeOffset RequestedAt { get; set; }

    public DateTimeOffset? EvaluatedAt { get; set; }
}
