using Chess.Backend.Akka.Ping;
using Chess.Backend.Events;

namespace Chess.Backend.Akka.Outbox;

/// <summary>`ping-{id}` / <see cref="Pinged"/> → the Part 0 wire format on <see cref="PingTopics.Kafka"/>.</summary>
internal sealed class PingedJournalMapper : IJournalEventMapper
{
    public Type EventType => typeof(Pinged);

    public OutboxRecord Map(string persistenceId, long sequenceNr, object evt)
    {
        ArgumentNullException.ThrowIfNull(persistenceId);
        Pinged pinged = (Pinged)evt;
        if (!persistenceId.StartsWith(PingActor.PersistenceIdPrefix, StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"Pinged under unexpected persistence id {persistenceId}.");
        }

        string pingId = persistenceId[PingActor.PersistenceIdPrefix.Length..];
        EventEnvelope<Pinged> envelope = new(EventTypes.Pinged, 1, pingId, sequenceNr, pinged.At, pinged);
        return new OutboxRecord(PingTopics.Kafka, PingTopics.Key(pingId), EventJson.Serialize(envelope));
    }
}
