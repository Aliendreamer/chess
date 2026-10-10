using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.WebApi.Lobby;

namespace Chess.Backend.Tests.Lobby;

public sealed class LobbyReadsTests
{
    private static readonly DateTimeOffset T0 = Time.Utc("2026-10-02T10:00:00Z");

    private static RmGame Game(string tc, int minutesAgo, string status = RmGame.Playing) => new()
    {
        GameId = Guid.CreateVersion7(),
        WhiteId = 1,
        WhiteName = "testuser",
        BlackId = 2,
        BlackName = "player",
        TimeControl = tc,
        Status = status,
        LastFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        LastUci = "e2e4",
        Ply = 1,
        CreatedAt = T0.AddMinutes(-60),
        UpdatedAt = T0.AddMinutes(-minutesAgo),
    };

    [Fact]
    public void In_play_counts_every_playing_game()
    {
        List<RmGame> games = [Game("10+5", 1), Game("3+2", 2, RmGame.Ended), Game("5+0", 3)];

        Assert.Equal(2, LobbyReads.InPlay(games.AsQueryable()).Count());
    }

    [Fact]
    public void The_answer_carries_the_count_and_the_queues_when_known()
    {
        QueueCounts queues = new([new QueueCount("1+0", 0), new QueueCount("5+0", 1)]);

        LobbyResponse lobby = LobbyReads.Compose(4, queues);

        Assert.Equal(4, lobby.GamesInPlay);
        Assert.Equal(queues.Queues, lobby.Queues);
        Assert.Null(LobbyReads.Compose(0, null).Queues);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Options_refuse_a_non_positive_cache(int cacheSeconds) =>
        Assert.Throws<InvalidOperationException>(() => new LobbyOptions { CacheSeconds = cacheSeconds }.Validate());
}
