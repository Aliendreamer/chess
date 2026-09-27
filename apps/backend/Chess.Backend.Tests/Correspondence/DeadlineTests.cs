using Akka.Actor;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Games;
using Chess.Backend.Correspondence;
using Chess.Backend.Events;
using Chess.Backend.Projections;

namespace Chess.Backend.Tests.Correspondence;

public sealed class DeadlineProjectionTests
{
    private static readonly DateTimeOffset T0 = Time.Utc("2026-09-27T10:00:00Z");
    private static readonly Guid Game = Guid.Parse("0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f");
    private static readonly TimeSpan Week = TimeSpan.FromDays(7);

    private static string Env<T>(string type, long seq, DateTimeOffset at, T payload) =>
        EventJson.Serialize(new EventEnvelope<T>(type, 1, Game.ToString("N"), seq, at, payload));

    private static string Created(string tc = "7d") => Env("game.created", 1, T0, new GameCreated(1, 2, tc, 0, 0, T0));

    private static string Moved(long seq, DateTimeOffset at) => Env("game.move-made", seq, at, new MoveMade((int)seq - 1, "e2e4", "e4", "fen", 0, 0, at));

    private static string Ended(long seq, DateTimeOffset at) => Env("game.ended", seq, at, new GameEnded("1-0", "Timeout", 0, 0, at));

    private static (ProjectDbContext Db, DeadlineProjection Projection) Build()
    {
        ProjectDbContext db = TestDb.Create();
        return (db, new DeadlineProjection(db, Options.Create(new CorrespondenceOptions()), NullLogger<DeadlineProjection>.Instance));
    }

    private static async Task ApplyAll(DeadlineProjection p, params string[] events)
    {
        foreach (string e in events)
        {
            await p.ApplyAsync(Game.ToString("N"), e, CancellationToken.None);
        }
    }

    [Fact]
    public async Task A_live_game_keeps_no_deadline()
    {
        (ProjectDbContext db, DeadlineProjection p) = Build();
        using (db)
        {
            await ApplyAll(p, Created("5+3"), Moved(2, T0.AddSeconds(5)));

            Assert.Equal(0, await db.GameDeadlines.CountAsync());
        }
    }

    [Fact]
    public async Task The_deadline_is_a_week_after_the_start_then_after_each_move()
    {
        (ProjectDbContext db, DeadlineProjection p) = Build();
        using (db)
        {
            await ApplyAll(p, Created());
            Assert.Equal(T0 + Week, (await db.GameDeadlines.AsNoTracking().SingleAsync()).DueAt);

            await ApplyAll(p, Moved(2, T0.AddDays(3)));
            Assert.Equal(T0.AddDays(3) + Week, (await db.GameDeadlines.AsNoTracking().SingleAsync()).DueAt);
        }
    }

    [Fact]
    public async Task The_end_clears_the_deadline_and_a_replay_does_not_bring_it_back()
    {
        (ProjectDbContext db, DeadlineProjection p) = Build();
        using (db)
        {
            string[] all = [Created(), Moved(2, T0.AddDays(1)), Ended(3, T0.AddDays(9))];
            await ApplyAll(p, all);
            await ApplyAll(p, all);

            GameDeadline row = await db.GameDeadlines.AsNoTracking().SingleAsync();
            Assert.Equal(((DateTimeOffset?)null, 3L), (row.DueAt, row.LastSeq));
        }
    }

    [Fact]
    public async Task A_gap_stalls()
    {
        (ProjectDbContext db, DeadlineProjection p) = Build();
        using (db)
        {
            await ApplyAll(p, Created());

            await Assert.ThrowsAsync<ProjectionGapException>(() => ApplyAll(p, Moved(3, T0.AddDays(1))));
        }
    }
}

public sealed class DeadlineSweeperTests : TestKit
{
    private sealed class FixedDue(params Guid[] ids) : IDueDeadlines
    {
        public List<DateTimeOffset> AskedAt { get; } = [];

        public Task<IReadOnlyList<Guid>> DueAsync(DateTimeOffset now, int max, CancellationToken ct)
        {
            AskedAt.Add(now);
            return Task.FromResult<IReadOnlyList<Guid>>([.. ids.Take(max)]);
        }
    }

    [Fact]
    public void Each_sweep_asks_every_due_game_to_check_its_deadline()
    {
        Guid a = Guid.CreateVersion7();
        Guid b = Guid.CreateVersion7();
        TestProbe games = CreateTestProbe();
        FixedDue due = new(a, b);

        Sys.ActorOf(Props.Create(() => new DeadlineSweeper(games.Ref, due, TimeProvider.System, TimeSpan.FromMilliseconds(200))));

        Assert.Equal(a, games.ExpectMsg<CheckDeadline>().GameId);
        Assert.Equal(b, games.ExpectMsg<CheckDeadline>().GameId);
        Assert.Equal(a, games.ExpectMsg<CheckDeadline>(TimeSpan.FromSeconds(2)).GameId); // the next sweep asks again
    }
}
