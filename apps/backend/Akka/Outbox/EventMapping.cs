using Akka.Persistence.Journal;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Ping;
using Chess.Backend.Events;
using Confluent.Kafka;

namespace Chess.Backend.Akka.Outbox;

/// <summary>
/// Tags each outbound event with the Kafka topic it belongs on, so <see cref="JournalPublisher"/> can tail
/// one <c>EventsByTag</c> stream per topic. Registered on the SQL journal; actors persist plain events and
/// never see tags.
/// </summary>
internal sealed class TopicTagger : IWriteEventAdapter
{
    public const string Name = "topic-tagger";

    /// <summary>Every event type the tagger knows; the journal binds the adapter to exactly these.</summary>
    public static readonly Type[] BoundTypes =
        [
            typeof(Pinged), typeof(GameCreated), typeof(MoveMade), typeof(DrawOffered), typeof(DrawDeclined), typeof(GameEnded),
            typeof(PlayerLeft), typeof(PlayerReturned), typeof(AbandonmentOffered),
        ];

    public string Manifest(object evt) => string.Empty;

    public object ToJournal(object evt) => evt switch
    {
        Pinged => new Tagged(evt, [PingTopics.Kafka]),
        // Every event a game persists goes to Kafka: consumers dedupe by (game, seq) and stall on a gap, so a game
        // event kept out of Kafka would stop every projection of that game.
        GameCreated or MoveMade or DrawOffered or DrawDeclined or GameEnded
            or PlayerLeft or PlayerReturned or AbandonmentOffered => new Tagged(evt, [GameTopics.Kafka]),
        _ => evt,
    };
}

/// <summary>
/// One Kafka record, ready to produce, with the trace of the event it came from (observability D5): the trace rides
/// beside the envelope as a header, never inside it.
/// </summary>
internal sealed record OutboxRecord(string Topic, string Key, string Json, string? Trace = null)
{
    /// <summary>The message to produce, published in a span continuing <see cref="Trace"/> whose context is its header.</summary>
    public Message<string, string> ToMessage() =>
        new() { Key = Key, Value = Json, Headers = PipelineTracing.Headers(PipelineTracing.Publish(Topic, Key, Trace)) };
}

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

internal static class GameTopics
{
    public const string Kafka = "game.events";

    public static string Key(string gameId) => "game:" + gameId;
}

/// <summary>
/// `game-{id}` events → the envelope on <see cref="GameTopics.Kafka"/>, keyed by game so one game's events stay in
/// order on one partition. One mapper per event type, all built from <see cref="GameJournalMapper{TEvent}"/>.
/// </summary>
internal static class GameJournalMappers
{
    public static IEnumerable<IJournalEventMapper> All() =>
    [
        new GameJournalMapper<GameCreated>("game.created", e => e.At),
        new GameJournalMapper<MoveMade>("game.move-made", e => e.At),
        new GameJournalMapper<DrawOffered>("game.draw-offered", e => e.At),
        new GameJournalMapper<DrawDeclined>("game.draw-declined", e => e.At),
        new GameJournalMapper<GameEnded>("game.ended", e => e.At),
        new GameJournalMapper<PlayerLeft>("game.player-left", e => e.At),
        new GameJournalMapper<PlayerReturned>("game.player-returned", e => e.At),
        new GameJournalMapper<AbandonmentOffered>("game.abandonment-offered", e => e.At),
    ];
}

internal sealed class GameJournalMapper<TEvent>(string type, Func<TEvent, DateTimeOffset> at) : IJournalEventMapper
    where TEvent : class
{
    public Type EventType => typeof(TEvent);

    public OutboxRecord Map(string persistenceId, long sequenceNr, object evt)
    {
        ArgumentNullException.ThrowIfNull(persistenceId);
        if (!persistenceId.StartsWith(GameActor.PersistenceIdPrefix, StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"{typeof(TEvent).Name} under unexpected persistence id {persistenceId}.");
        }

        TEvent e = (TEvent)evt;
        string gameId = persistenceId[GameActor.PersistenceIdPrefix.Length..];
        EventEnvelope<TEvent> envelope = new(type, 1, gameId, sequenceNr, at(e), e);
        return new OutboxRecord(GameTopics.Kafka, GameTopics.Key(gameId), EventJson.Serialize(envelope), (e as ITracedEvent)?.Trace);
    }
}

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
        return new OutboxRecord(PingTopics.Kafka, PingTopics.Key(pingId), EventJson.Serialize(envelope), pinged.Trace);
    }
}
