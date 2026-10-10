namespace Chess.Backend.Data.Models;

/// <summary>A member's Leitner box for one master-game position (training D1, D4). Private to the member.</summary>
internal sealed class TrainingProgress
{
    public long UserId { get; set; }

    public Guid PositionId { get; set; }

    public int Box { get; set; }

    public DateTimeOffset DueAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
