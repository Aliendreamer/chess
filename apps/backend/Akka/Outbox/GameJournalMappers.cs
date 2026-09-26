using Chess.Backend.Akka.Games;
using Chess.Backend.Events;

namespace Chess.Backend.Akka.Outbox;

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
        return new OutboxRecord(GameTopics.Kafka, GameTopics.Key(gameId), EventJson.Serialize(envelope));
    }
}
