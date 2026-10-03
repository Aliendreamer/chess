namespace Chess.Backend.Data.Models;

/// <summary>
/// How well a member knows one named line from one side (opening-trainer): a Leitner box 0–5 and when the line is next
/// due. Private to the member.
/// </summary>
internal sealed class TrainerProgress
{
    public long UserId { get; set; }

    /// <summary>The line's end position (<c>openings.PositionKey</c>).</summary>
    public required string LineKey { get; set; }

    /// <summary><c>white</c> or <c>black</c>: the side the member plays.</summary>
    public required string Color { get; set; }

    public int Box { get; set; }

    public DateTimeOffset DueAt { get; set; }

    /// <summary>The last run had no mistake.</summary>
    public bool LastClean { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
