namespace Chess.Backend.Projections;

internal interface IProjection
{
    string Topic { get; }

    string GroupId { get; }

    /// <summary>
    /// Must be idempotent by (aggregateId, seq) through <see cref="IdempotencyGuard"/>: the same event arrives
    /// again after a crash before commit, a publisher restart, or a deliberate replay. <paramref name="key"/>
    /// is the Kafka record key (not necessarily the aggregate id — a projection may need it for partitioning
    /// or for aggregates keyed differently than their payload's id); <paramref name="json"/> is untrusted
    /// broker data. Implementations must not throw on malformed or unrecognised input — ignore it instead, the
    /// same way <see cref="Events.EventJson.TryDeserialize{T}"/> does — since a poison message would otherwise
    /// spin the retry loop forever. The one deliberate exception is <see cref="ProjectionGapException"/>: a
    /// missing seq means an event was lost upstream, and stalling (retry with backoff, logged) is the point.
    /// </summary>
    Task ApplyAsync(string key, string json, CancellationToken ct);
}
