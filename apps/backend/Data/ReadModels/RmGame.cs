namespace Chess.Backend.Data.ReadModels;

/// <summary>
/// One row per game, projected from <c>game.events</c> by <c>GameProjection</c> on the primary and read from the replica.
/// <see cref="LastSeq"/> is the idempotency watermark and the concurrency token (event-publishing). Player names are the
/// usernames snapshotted when the game was created (D23).
/// </summary>
internal sealed class RmGame
{
    public const string Playing = "playing";
    public const string Ended = "ended";

    public Guid GameId { get; set; }

    public long WhiteId { get; set; }

    public required string WhiteName { get; set; }

    public long BlackId { get; set; }

    public required string BlackName { get; set; }

    public required string TimeControl { get; set; }

    /// <summary><see cref="Playing"/> or <see cref="Ended"/> (an aborted game is ended with result <c>*</c>).</summary>
    public required string Status { get; set; }

    /// <summary>PGN result: <c>1-0</c>, <c>0-1</c>, <c>1/2-1/2</c> or <c>*</c>; null while playing.</summary>
    public string? Result { get; set; }

    public string? Reason { get; set; }

    public int Ply { get; set; }

    public required string LastFen { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? EndedAt { get; set; }

    /// <summary>Time of the last move or the ending: the order of the lists.</summary>
    public DateTimeOffset UpdatedAt { get; set; }

    public long LastSeq { get; set; }

    /// <summary>Built from the moves when the game ends (D22); null until then.</summary>
    public string? Pgn { get; set; }
}

/// <summary>One row per player per game: "my games" is one index seek on (UserId, CreatedAt, GameId).</summary>
internal sealed class RmGamePlayer
{
    public const string White = "white";
    public const string Black = "black";

    public long UserId { get; set; }

    public Guid GameId { get; set; }

    public required string Color { get; set; }

    public long OpponentId { get; set; }

    public required string OpponentName { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

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
