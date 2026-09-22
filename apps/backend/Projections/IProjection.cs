namespace Chess.Backend.Projections;

internal interface IProjection
{
    string Topic { get; }

    string GroupId { get; }

    /// <summary>
    /// Must be idempotent: the same event may arrive again after a crash before commit. <paramref name="key"/>
    /// is the Kafka record key (not necessarily the aggregate id — a projection may need it for partitioning
    /// or for aggregates keyed differently than their payload's id); <paramref name="json"/> is untrusted
    /// broker data. Implementations must not throw on malformed or unrecognised input — ignore it instead, the
    /// same way <see cref="Events.EventJson.TryDeserialize{T}"/> does — since throwing would fault the
    /// consumer stream on a poison message and spin its retry loop forever.
    /// </summary>
    Task ApplyAsync(string key, string json, CancellationToken ct);
}
