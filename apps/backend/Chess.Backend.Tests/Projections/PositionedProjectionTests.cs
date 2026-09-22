using Chess.Backend.Data.ReadModels;
using Chess.Backend.Events;
using Chess.Backend.Projections;

namespace Chess.Backend.Tests.Projections;

public sealed class PositionedProjectionTests
{
    private static readonly DateTimeOffset T0 = DateTimeOffset.UnixEpoch;

    /// <summary>Stands in for a Part 1 consumer with no per-aggregate row: every event adds a row elsewhere.</summary>
    private sealed class CountingProjection(ProjectDbContext db, bool fail = false)
        : PositionedProjection<Pinged>(db, NullLogger<PositionedProjection<Pinged>>.Instance)
    {
        public override string Topic => "game.events";

        public override string GroupId => "test.counting";

        protected override string EventType => EventTypes.Pinged;

        protected override Task StageAsync(EventEnvelope<Pinged> e, CancellationToken ct)
        {
            if (fail)
            {
                throw new InvalidOperationException("effect failed");
            }

            // Staged only; the base saves it together with the position.
            Db.RmPings.Add(new RmPing { PingId = $"{e.AggregateId}-{e.Seq}", LastSeq = e.Seq, UpdatedAt = e.At });
            return Task.CompletedTask;
        }
    }

    private static string Event(string id, long seq) =>
        EventJson.Serialize(new EventEnvelope<Pinged>(EventTypes.Pinged, 1, id, seq, T0, new Pinged("x", 1, T0)));

    [Fact]
    public async Task Applies_once_per_seq_and_tracks_the_position()
    {
        using ProjectDbContext db = TestDb.Create();
        CountingProjection p = new(db);

        await p.ApplyAsync("k", Event("a", 1), CancellationToken.None);
        await p.ApplyAsync("k", Event("a", 2), CancellationToken.None);
        await p.ApplyAsync("k", Event("a", 2), CancellationToken.None); // duplicate
        await p.ApplyAsync("k", Event("a", 1), CancellationToken.None); // old replay

        Assert.Equal(2, await db.RmPings.CountAsync());
        ConsumerPosition pos = await db.ConsumerPositions.SingleAsync();
        Assert.Equal(("test.counting", "a", 2L), (pos.GroupId, pos.AggregateId, pos.LastSeq));
    }

    [Fact]
    public async Task Positions_are_per_aggregate()
    {
        using ProjectDbContext db = TestDb.Create();
        CountingProjection p = new(db);
        await p.ApplyAsync("k", Event("a", 1), CancellationToken.None);
        await p.ApplyAsync("k", Event("b", 1), CancellationToken.None);
        Assert.Equal(2, await db.ConsumerPositions.CountAsync());
    }

    [Fact]
    public async Task A_gap_throws_and_changes_nothing()
    {
        using ProjectDbContext db = TestDb.Create();
        CountingProjection p = new(db);
        await p.ApplyAsync("k", Event("a", 1), CancellationToken.None);

        await Assert.ThrowsAsync<ProjectionGapException>(() => p.ApplyAsync("k", Event("a", 3), CancellationToken.None));

        Assert.Equal(1, await db.RmPings.CountAsync());
        Assert.Equal(1, (await db.ConsumerPositions.SingleAsync()).LastSeq);
    }

    [Fact]
    public async Task A_failed_effect_does_not_advance_the_position()
    {
        using ProjectDbContext db = TestDb.Create();
        await Assert.ThrowsAsync<InvalidOperationException>(() => new CountingProjection(db, fail: true).ApplyAsync("k", Event("a", 1), CancellationToken.None));
        Assert.Equal(0, await db.ConsumerPositions.CountAsync());
    }

    [Fact]
    public async Task Ignores_other_types_and_garbage()
    {
        using ProjectDbContext db = TestDb.Create();
        CountingProjection p = new(db);
        await p.ApplyAsync("k", "not json", CancellationToken.None);
        await p.ApplyAsync("k", """{"type":"other","v":1,"aggregateId":"a","seq":1,"at":"2026-01-01T00:00:00Z","payload":{"text":"x","userId":1,"at":"2026-01-01T00:00:00Z"}}""", CancellationToken.None);
        Assert.Equal(0, await db.ConsumerPositions.CountAsync());
    }
}
