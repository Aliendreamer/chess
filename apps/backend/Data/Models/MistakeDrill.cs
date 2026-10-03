namespace Chess.Backend.Data.Models;

/// <summary>
/// One of a member's own mistakes, kept to practise (game-review D7): the position before it, the move played, the
/// moves the engine accepts there, and the trainer's Leitner box and due time. Private to the member.
/// </summary>
internal sealed class MistakeDrill
{
    public long UserId { get; set; }

    public Guid GameId { get; set; }

    /// <summary>The ply of the mistake (1 = White's first move).</summary>
    public int Ply { get; set; }

    /// <summary>The position before the mistake, with the member to move.</summary>
    public required string Fen { get; set; }

    public required string PlayedUci { get; set; }

    public required string PlayedSan { get; set; }

    /// <summary>The engine's lines' first moves within the tolerance of its best: any of them is a right answer.</summary>
    public List<string> AcceptedUci { get; set; } = [];

    /// <summary>The engine's best line, UCI from the position.</summary>
    public List<string> BestLine { get; set; } = [];

    /// <summary><c>mistake</c> or <c>blunder</c>.</summary>
    public required string Class { get; set; }

    public int Box { get; set; }

    public DateTimeOffset DueAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
