namespace Chess.Backend.Akka.Outbox;

/// <summary>One Kafka record, ready to produce.</summary>
internal sealed record OutboxRecord(string Topic, string Key, string Json);

/// <summary>Turns one journal event of <see cref="EventType"/> into the record the rest of the system consumes.</summary>
internal interface IJournalEventMapper
{
    Type EventType { get; }

    OutboxRecord Map(string persistenceId, long sequenceNr, object evt);
}

/// <summary>
/// Every mapper, keyed by event type. An unmapped event is an error, never a skip: skipping would drop the
/// event from Kafka for good — the very gap the outbox exists to close.
/// </summary>
internal sealed class JournalEventMappers
{
    private readonly Dictionary<Type, IJournalEventMapper> _byType = [];

    public JournalEventMappers(IEnumerable<IJournalEventMapper> mappers)
    {
        ArgumentNullException.ThrowIfNull(mappers);
        foreach (IJournalEventMapper m in mappers)
        {
            if (!_byType.TryAdd(m.EventType, m))
            {
                throw new InvalidOperationException($"More than one journal mapper for {m.EventType}.");
            }
        }
    }

    public bool CanMap(Type eventType) => _byType.ContainsKey(eventType);

    public OutboxRecord Map(string persistenceId, long sequenceNr, object evt)
    {
        ArgumentNullException.ThrowIfNull(evt);
        return _byType.TryGetValue(evt.GetType(), out IJournalEventMapper? mapper)
            ? mapper.Map(persistenceId, sequenceNr, evt)
            : throw new UnmappedJournalEventException(evt.GetType(), persistenceId, sequenceNr);
    }
}

internal sealed class UnmappedJournalEventException : Exception
{
    public UnmappedJournalEventException(Type eventType, string persistenceId, long sequenceNr)
        : base($"No journal mapper for {eventType} ({persistenceId}#{sequenceNr}); the publisher stops here rather than skip it.")
    {
    }

    public UnmappedJournalEventException()
    {
    }

    public UnmappedJournalEventException(string message) : base(message)
    {
    }

    public UnmappedJournalEventException(string message, Exception innerException) : base(message, innerException)
    {
    }
}
