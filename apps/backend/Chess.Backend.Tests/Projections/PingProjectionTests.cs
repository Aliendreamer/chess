using Chess.Backend.Data.ReadModels;
using Chess.Backend.Projections;

namespace Chess.Backend.Tests.Projections;

public sealed class PingProjectionTests
{
    private static readonly DateTimeOffset T0 = Time.Utc("2026-09-22T10:00:00Z");

    private static string Event(string id, long seq, string text) => Envelopes.Pinged(id, seq, text, T0.AddSeconds(seq));

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
    public async Task A_gap_stalls_instead_of_skipping()
    {
        using ProjectDbContext db = TestDb.Create();
        PingProjection p = new(db, NullLogger<PingProjection>.Instance);
        await p.ApplyAsync("ping:p1", Event("p1", 1, "one"), CancellationToken.None);
        await p.ApplyAsync("ping:p1", Event("p1", 2, "two"), CancellationToken.None);
        await p.ApplyAsync("ping:p1", Event("p1", 3, "three"), CancellationToken.None);

        // seq 4 never arrived: applying 5 would make the read model silently wrong.
        await Assert.ThrowsAsync<ProjectionGapException>(() => p.ApplyAsync("ping:p1", Event("p1", 5, "five"), CancellationToken.None));

        RmPing row = await db.RmPings.AsNoTracking().SingleAsync();
        Assert.Equal(3, row.LastSeq);
        Assert.Equal(3, row.Count);
    }

    [Fact]
    public async Task A_new_aggregate_must_start_at_seq_1()
    {
        using ProjectDbContext db = TestDb.Create();
        PingProjection p = new(db, NullLogger<PingProjection>.Instance);
        await Assert.ThrowsAsync<ProjectionGapException>(() => p.ApplyAsync("ping:p9", Event("p9", 2, "two"), CancellationToken.None));
        Assert.Equal(0, await db.RmPings.CountAsync());
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
    public async Task A_racing_second_writer_of_the_same_seq_fails_instead_of_double_applying()
    {
        string name = Guid.NewGuid().ToString("N");
        using (ProjectDbContext seed = TestDb.Create(name: name))
        {
            await new PingProjection(seed, NullLogger<PingProjection>.Instance).ApplyAsync("ping:p1", Event("p1", 1, "one"), CancellationToken.None);
        }

        // Two consumers during a rebalance: both have read LastSeq = 1 before either saves seq 2.
        using ProjectDbContext first = TestDb.Create(name: name);
        using ProjectDbContext second = TestDb.Create(name: name);
        RmPing a = await first.RmPings.SingleAsync();
        RmPing b = await second.RmPings.SingleAsync();
        (a.Count, a.LastSeq) = (a.Count + 1, 2);
        (b.Count, b.LastSeq) = (b.Count + 1, 2);
        await first.SaveChangesAsync();

        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => second.SaveChangesAsync());
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
