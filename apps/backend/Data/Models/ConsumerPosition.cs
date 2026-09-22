namespace Chess.Backend.Data.Models;

/// <summary>
/// Idempotency high-water mark for a consumer that keeps no per-aggregate row of its own (design D10 shape 2):
/// the last journal <c>seq</c> of <see cref="AggregateId"/> that consumer <see cref="GroupId"/> has applied.
/// Updated in the same SaveChanges as the effect, so the two cannot disagree.
/// </summary>
internal sealed class ConsumerPosition
{
    public required string GroupId { get; set; }

    public required string AggregateId { get; set; }

    public long LastSeq { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
