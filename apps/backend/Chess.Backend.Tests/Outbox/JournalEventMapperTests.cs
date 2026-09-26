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
        Pinged evt = new("hello", 42, At);

        OutboxRecord r = Registry().Map("ping-abc", 3, evt);

        Assert.Equal((PingTopics.Kafka, "ping:abc"), (r.Topic, r.Key));
        // Byte-identical to the envelope the actor used to publish itself: type, v1, id without prefix, seq, at.
        Assert.Equal(EventJson.Serialize(new EventEnvelope<Pinged>(EventTypes.Pinged, 1, "abc", 3, At, evt)), r.Json);
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
}
