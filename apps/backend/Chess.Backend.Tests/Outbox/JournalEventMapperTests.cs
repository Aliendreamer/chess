using Chess.Backend.Akka.Outbox;
using Chess.Backend.Akka.Ping;
using Chess.Backend.Events;

namespace Chess.Backend.Tests.Outbox;

public sealed class JournalEventMapperTests
{
    private static readonly DateTimeOffset At = new(2026, 9, 23, 10, 0, 0, TimeSpan.Zero);

    private static JournalEventMappers Registry() => new([new PingedJournalMapper()]);

    [Fact]
    public void Pinged_maps_to_the_part0_wire_format()
    {
        OutboxRecord r = Registry().Map("ping-abc", 3, new Pinged("hello", 42, At));

        Assert.Equal(PingTopics.Kafka, r.Topic);
        Assert.Equal("ping:abc", r.Key);
        Assert.True(EventJson.TryDeserialize(r.Json, out EventEnvelope<Pinged>? e));
        Assert.Equal(EventTypes.Pinged, e.Type);
        Assert.Equal(1, e.V);
        Assert.Equal("abc", e.AggregateId);
        Assert.Equal(3, e.Seq);
        Assert.Equal(At, e.At);
        Assert.Equal(new Pinged("hello", 42, At), e.Payload);
    }

    [Fact]
    public void Json_is_identical_to_what_the_actor_used_to_publish()
    {
        Pinged evt = new("hello", 42, At);
        string expected = EventJson.Serialize(new EventEnvelope<Pinged>(EventTypes.Pinged, 1, "abc", 3, At, evt));
        Assert.Equal(expected, Registry().Map("ping-abc", 3, evt).Json);
    }

    [Fact]
    public void Unmapped_event_throws_with_type_and_persistence_id()
    {
        UnmappedJournalEventException ex = Assert.Throws<UnmappedJournalEventException>(() => Registry().Map("game-1", 7, "not an event"));
        Assert.Contains("System.String", ex.Message, StringComparison.Ordinal);
        Assert.Contains("game-1", ex.Message, StringComparison.Ordinal);
        Assert.Contains("#7", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Pinged_under_a_foreign_persistence_id_is_rejected() =>
        Assert.Throws<InvalidOperationException>(() => Registry().Map("game-1", 1, new Pinged("x", 1, At)));

    [Fact]
    public void Duplicate_mappers_for_one_type_are_rejected() =>
        Assert.Throws<InvalidOperationException>(() => new JournalEventMappers([new PingedJournalMapper(), new PingedJournalMapper()]));

    [Fact]
    public void Every_tagged_type_has_a_mapper()
    {
        // The tagger decides what leaves the process; the registry (as production registers it) must map all of it.
        JournalEventMappers registry = new([new PingedJournalMapper(), .. GameJournalMappers.All()]);
        Assert.All(TopicTagger.BoundTypes, t => Assert.True(registry.CanMap(t), $"{t} is tagged but has no mapper"));
    }
}
