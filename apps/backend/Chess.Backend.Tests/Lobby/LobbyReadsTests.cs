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
    public void Tv_lists_the_newest_activity_first_up_to_the_limit()
    {
        List<RmGame> games = [.. Enumerable.Range(1, 8).Select(i => Game("3+2", i))];

        List<RmGame> tv = [.. LobbyReads.Tv(games.AsQueryable(), 6)];

        Assert.Equal(games.Take(6).Select(g => g.GameId), tv.Select(g => g.GameId));
    }

    [Fact]
    public void Tv_leaves_out_correspondence_and_ended_games()
    {
        RmGame live = Game("5+0", 3);
        List<RmGame> games = [Game("7d", 1), Game("3+2", 2, RmGame.Ended), live, Game("untimed", 4)];

        List<RmGame> tv = [.. LobbyReads.Tv(games.AsQueryable(), 6)];

        Assert.Equal([live.GameId, games[3].GameId], tv.Select(g => g.GameId));
    }

    [Fact]
    public void In_play_counts_every_playing_game_correspondence_included()
    {
        List<RmGame> games = [Game("7d", 1), Game("3+2", 2, RmGame.Ended), Game("5+0", 3)];

        Assert.Equal(2, LobbyReads.InPlay(games.AsQueryable()).Count());
    }

    [Fact]
    public void The_answer_carries_positions_names_and_the_queues_when_known()
    {
        RmGame g = Game("5+0", 3);
        QueueCounts queues = new([new QueueCount("1+0", 0), new QueueCount("5+0", 1)]);

        LobbyResponse lobby = LobbyReads.Compose(4, [g], queues);

        Assert.Equal(4, lobby.GamesInPlay);
        Assert.Equal(queues.Queues, lobby.Queues);
        TvGame tv = Assert.Single(lobby.Tv);
        Assert.Equal((g.GameId, "testuser", "player", "5+0", g.LastFen, "e2e4", 1), (tv.GameId, tv.White, tv.Black, tv.TimeControl, tv.Fen, tv.LastUci, tv.Ply));
        Assert.Null(LobbyReads.Compose(0, [], null).Queues);
    }

    [Theory]
    [InlineData(0, 2)]
    [InlineData(6, 0)]
    [InlineData(51, 2)]
    public void Options_refuse_an_empty_or_huge_tv_and_a_non_positive_cache(int tv, int cacheSeconds) =>
        Assert.Throws<InvalidOperationException>(() => new LobbyOptions { TvGames = tv, CacheSeconds = cacheSeconds }.Validate());
}
