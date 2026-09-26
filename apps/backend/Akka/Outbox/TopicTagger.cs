using Akka.Persistence.Journal;
using Chess.Backend.Akka.Ping;
using Chess.Backend.Events;

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
