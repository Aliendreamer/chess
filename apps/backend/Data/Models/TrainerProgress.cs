namespace Chess.Backend.Data.Models;

/// <summary>
/// How well a member knows one line from one side (opening-trainer): a Leitner box 0–5 and when the line is next due.
/// Private to the member. A named line has no <see cref="StudyId"/>; a line of the member's own study has one
/// (study-repertoire-trainer D5), and its rows go with the study.
/// </summary>
internal sealed class TrainerProgress
{
    public long UserId { get; set; }

    /// <summary>A named line's end position (<c>openings.PositionKey</c>), or a study line's <c>study:</c> hash.</summary>
    public required string LineKey { get; set; }

    /// <summary>The study a study line belongs to; null for a named line.</summary>
    public Guid? StudyId { get; set; }

    /// <summary><c>white</c> or <c>black</c>: the side the member plays.</summary>
    public required string Color { get; set; }

    public int Box { get; set; }

    public DateTimeOffset DueAt { get; set; }

    /// <summary>The last run had no mistake.</summary>
    public bool LastClean { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
