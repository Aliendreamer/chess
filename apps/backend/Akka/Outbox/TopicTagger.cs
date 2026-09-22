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
    public static readonly Type[] BoundTypes = [typeof(Pinged)];

    public string Manifest(object evt) => string.Empty;

    public object ToJournal(object evt) => evt switch
    {
        Pinged => new Tagged(evt, [PingTopics.Kafka]),
        _ => evt,
    };
}
