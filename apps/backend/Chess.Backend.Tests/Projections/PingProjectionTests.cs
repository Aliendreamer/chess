using Chess.Backend.Data.ReadModels;
using Chess.Backend.Events;
using Chess.Backend.Projections;

namespace Chess.Backend.Tests.Projections;

public sealed class PingProjectionTests
{
    private static readonly DateTimeOffset T0 = DateTimeOffset.Parse("2026-09-22T10:00:00Z", System.Globalization.CultureInfo.InvariantCulture);

    private static string Event(string id, long seq, string text) =>
        EventJson.Serialize(new EventEnvelope<Pinged>(EventTypes.Pinged, 1, id, seq, T0.AddSeconds(seq), new Pinged(text, 1, T0.AddSeconds(seq))));

    [Fact]
    public async Task Applies_events_in_order_and_ignores_replays()
    {
        using ProjectDbContext db = TestDb.Create();
        PingProjection p = new(db, NullLogger<PingProjection>.Instance);

        await p.ApplyAsync("ping:p1", Event("p1", 1, "one"), CancellationToken.None);
        await p.ApplyAsync("ping:p1", Event("p1", 2, "two"), CancellationToken.None);
        await p.ApplyAsync("ping:p1", Event("p1", 1, "one"), CancellationToken.None); // redelivered

        RmPing row = await db.RmPings.SingleAsync();
        Assert.Equal(2, row.Count);
        Assert.Equal("two", row.LastText);
        Assert.Equal(2, row.LastSeq);
    }

    [Fact]
    public async Task Ignores_other_event_types_and_garbage()
    {
        using ProjectDbContext db = TestDb.Create();
        PingProjection p = new(db, NullLogger<PingProjection>.Instance);
        await p.ApplyAsync("x", "not json", CancellationToken.None);
        await p.ApplyAsync("x", """{"type":"other","v":1,"aggregateId":"a","seq":1,"at":"2026-01-01T00:00:00Z","payload":{}}""", CancellationToken.None);
        Assert.Equal(0, await db.RmPings.CountAsync());
    }

    [Fact]
    public void Identifies_its_topic_and_group()
    {
        using ProjectDbContext db = TestDb.Create();
        PingProjection p = new(db, NullLogger<PingProjection>.Instance);
        Assert.Equal("game.events", p.Topic);
        Assert.Equal("chess.rm-pings", p.GroupId);
    }
}
