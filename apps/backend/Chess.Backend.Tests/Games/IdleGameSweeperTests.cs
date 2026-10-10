using Akka.Actor;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Games;
using Chess.Backend.Data.ReadModels;

namespace Chess.Backend.Tests.Games;

public sealed class IdleGameSweeperTests : TestKit
{
    private sealed class FixedIdle(params Guid[] ids) : IIdleGames
    {
        public List<DateTimeOffset> AskedAt { get; } = [];

        public Task<IReadOnlyList<Guid>> QuietAsync(DateTimeOffset now, int max, CancellationToken ct)
        {
            AskedAt.Add(now);
            return Task.FromResult<IReadOnlyList<Guid>>([.. ids.Take(max)]);
        }
    }

    [Fact]
    public void Each_sweep_wakes_every_quiet_game()
    {
        Guid a = Guid.CreateVersion7();
        Guid b = Guid.CreateVersion7();
        TestProbe games = CreateTestProbe();
        FixedIdle idle = new(a, b);

        Sys.ActorOf(Props.Create(() => new IdleGameSweeper(games.Ref, idle, TimeProvider.System, TimeSpan.FromMilliseconds(200))));

        Assert.Equal(a, games.ExpectMsg<WakeIdle>().GameId);
        Assert.Equal(b, games.ExpectMsg<WakeIdle>().GameId);
        Assert.Equal(a, games.ExpectMsg<WakeIdle>(TimeSpan.FromSeconds(2)).GameId); // the next sweep wakes it again
    }
}

/// <summary>The sweep's query (engine-game-abandonment D4).</summary>
public sealed class IdleGamesTests
{
    private static readonly DateTimeOffset Now = Time.Utc("2026-10-05T12:00:00Z");
    private static readonly TimeSpan Idle = TimeSpan.FromMinutes(30);

    private static RmGame Row(string tc, string status, DateTimeOffset updatedAt) => new()
    {
        GameId = Guid.CreateVersion7(),
        WhiteName = "w",
        BlackName = "b",
        TimeControl = tc,
        Status = status,
        LastFen = "fen",
        UpdatedAt = updatedAt,
    };

    [Fact]
    public async Task Quiet_untimed_games_in_play_come_oldest_first()
    {
        using ProjectDbContext db = TestDb.Create();
        RmGame older = Row("untimed", RmGame.Playing, Now.AddHours(-5));
        RmGame quiet = Row("untimed", RmGame.Playing, Now - Idle - TimeSpan.FromSeconds(1));
        db.RmGames.AddRange(
            quiet,
            older,
            Row("untimed", RmGame.Playing, Now.AddMinutes(-5)), // recent: the person may be thinking
            Row("untimed", RmGame.Ended, Now.AddHours(-5)),
            Row("5+3", RmGame.Playing, Now.AddHours(-5)));
        await db.SaveChangesAsync();

        IReadOnlyList<Guid> ids = await IdleGames.QueryAsync(db, Now, 10, Idle, CancellationToken.None);

        Assert.Equal([older.GameId, quiet.GameId], ids);
    }

    [Fact]
    public async Task The_total_never_exceeds_the_limit()
    {
        using ProjectDbContext db = TestDb.Create();
        for (int i = 0; i < 3; i++)
        {
            db.RmGames.Add(Row("untimed", RmGame.Playing, Now.AddHours(-i - 1)));
        }

        await db.SaveChangesAsync();

        Assert.Equal(3, (await IdleGames.QueryAsync(db, Now, 4, Idle, CancellationToken.None)).Count);
        Assert.Equal(2, (await IdleGames.QueryAsync(db, Now, 2, Idle, CancellationToken.None)).Count);
    }
}
