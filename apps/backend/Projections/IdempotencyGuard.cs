namespace Chess.Backend.Projections;

internal enum SeqDecision
{
    /// <summary>The next event for this aggregate: apply it.</summary>
    Apply,

    /// <summary>Already applied (redelivery, publisher restart, deliberate replay): skip it.</summary>
    Skip,

    /// <summary>An earlier event never arrived: stop rather than apply out of order.</summary>
    Gap,
}

/// <summary>
/// The one rule every Kafka consumer applies (design D10): a per-(consumer, aggregate) high-water mark on the
/// journal <c>seq</c>. With a single ordered publisher and key partitioning a consumer can only ever see
/// <c>last + 1</c> or something it already has; anything further ahead means an event was lost upstream, and
/// the consumer stalls on it instead of producing a silently wrong read model.
/// </summary>
internal static class IdempotencyGuard
{
    public static SeqDecision Decide(long lastSeq, long seq) =>
        seq <= lastSeq ? SeqDecision.Skip
        : seq == lastSeq + 1 ? SeqDecision.Apply
        : SeqDecision.Gap;
}

internal sealed class ProjectionGapException : Exception
{
    public ProjectionGapException(string groupId, string aggregateId, long lastSeq, long seq)
        : base($"{groupId}: gap for {aggregateId} — expected seq {lastSeq + 1}, got {seq}; stalling instead of skipping.")
    {
    }

    public ProjectionGapException()
    {
    }

    public ProjectionGapException(string message) : base(message)
    {
    }

    public ProjectionGapException(string message, Exception innerException) : base(message, innerException)
    {
    }
}
