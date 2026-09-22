using Akka.Persistence.Journal;
using Chess.Backend.Akka.Outbox;
using Chess.Backend.Akka.Ping;
using Chess.Backend.Events;

namespace Chess.Backend.Tests.Outbox;

public sealed class TopicTaggerTests
{
    private readonly TopicTagger _tagger = new();

    [Fact]
    public void Pinged_is_tagged_with_its_kafka_topic()
    {
        Pinged evt = new("hi", 1, DateTimeOffset.UnixEpoch);

        Tagged tagged = Assert.IsType<Tagged>(_tagger.ToJournal(evt));

        Assert.Same(evt, tagged.Payload);
        Assert.Equal([PingTopics.Kafka], tagged.Tags);
    }

    [Fact]
    public void Untagged_events_pass_through()
    {
        object other = new();
        Assert.Same(other, _tagger.ToJournal(other));
    }

    [Fact]
    public void Manifest_is_empty() => Assert.Equal(string.Empty, _tagger.Manifest(new Pinged("hi", 1, DateTimeOffset.UnixEpoch)));
}
