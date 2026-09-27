namespace Chess.Backend.Data.ReadModels;

/// <summary>One row per move: enough to replay a game move by move with its clocks.</summary>
internal sealed class RmMove
{
    public Guid GameId { get; set; }

    public int Ply { get; set; }

    public required string Uci { get; set; }

    public required string San { get; set; }

    public required string FenAfter { get; set; }

    public long WhiteMs { get; set; }

    public long BlackMs { get; set; }

    public DateTimeOffset At { get; set; }
}
