using Chess.Backend.Akka.Outbox;
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

        Assert.Equal(("game.events", "ping:abc"), (r.Topic, r.Key));
        // The wire format, pinned as a literal: type, v1, id without prefix, seq, at, camelCase payload.
        Assert.Equal(
            """{"type":"ping.pinged","v":1,"aggregateId":"abc","seq":3,"at":"2026-09-23T10:00:00+00:00","payload":{"text":"hello","userId":42,"at":"2026-09-23T10:00:00+00:00"}}""",
            r.Json);
    }

    [Fact]
    public void An_events_trace_travels_beside_the_envelope_never_inside_it()
    {
        const string Trace = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
        JournalEventMappers games = new(GameJournalMappers.All());

        OutboxRecord traced = Registry().Map("ping-abc", 3, new Pinged("hello", 42, At, Trace));
        OutboxRecord bare = Registry().Map("ping-abc", 3, new Pinged("hello", 42, At));
        OutboxRecord move = games.Map("game-0199f1c2a3b47c5d8e9f0a1b2c3d4e5f", 2, new MoveMade(1, "e2e4", "e4", "fen", 1_000, 1_000, At, Trace));

        Assert.Equal(Trace, traced.Trace);
        Assert.Null(bare.Trace);
        Assert.Equal(bare.Json, traced.Json);
        Assert.Equal(Trace, move.Trace);
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
