namespace Chess.Backend.Data.Models;

/// <summary>
/// A library position the miner has looked at (training D1, D3): one row per position ever asked about, so none is
/// examined twice. <see cref="Waiting"/> until the engine's evaluation is there, then <see cref="Critical"/> (it is in
/// <c>training_positions</c>) or <see cref="Quiet"/>.
/// </summary>
internal sealed class TrainingCandidate
{
    public const string Waiting = "waiting";
    public const string Critical = "critical";
    public const string Quiet = "quiet";

    public required string PositionKey { get; set; }

    public required string Fen { get; set; }

    public Guid LibraryGameId { get; set; }

    /// <summary>The ply of the position in its game.</summary>
    public int Ply { get; set; }

    /// <summary>The move the game played from here.</summary>
    public required string MasterUci { get; set; }

    public required string Status { get; set; }

    /// <summary>When the evaluation was last asked for.</summary>
    public DateTimeOffset RequestedAt { get; set; }

    public DateTimeOffset? JudgedAt { get; set; }
}
