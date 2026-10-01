using Chess.Backend.Akka.Games;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Games;
using Chess.Backend.WebApi.Games;

namespace Chess.Backend.Tests.Games;

public sealed class GameReadModelTests
{
    private static readonly Guid Id = Guid.Parse("0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f");
    private static readonly DateTimeOffset T0 = Time.Utc("2026-09-26T10:00:00Z");

    private static RmGame Ended() => new()
    {
        GameId = Id,
        WhiteId = 1,
        WhiteName = "testuser",
        BlackId = 2,
        BlackName = "player",
        TimeControl = "5+3",
        Status = "ended",
        Result = "0-1",
        Reason = "Checkmate",
        Ply = 4,
        LastFen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
        LastUci = "d8h4",
        LastSan = "Qh4#",
        WhiteMs = 290_000,
        BlackMs = 295_000,
        CreatedAt = T0,
        EndedAt = T0.AddSeconds(6),
        UpdatedAt = T0.AddSeconds(6),
        LastSeq = 6,
        Pgn = "…",
    };

    [Theory]
    [InlineData("playing", true)]
    [InlineData("ended", true)]
    [InlineData("Playing", false)] // the query value is the lower-case wire form
    [InlineData("open", false)] // change 3 adds it
    [InlineData(null, false)]
    public void Only_known_list_statuses_are_accepted(string? status, bool ok) =>
        Assert.Equal(ok, GameReads.IsListStatus(status));

    [Fact]
    public void An_ended_row_becomes_the_same_view_the_actor_would_give()
    {
        GameView view = GameReads.ToView(Ended());

        Assert.Equal(
            new GameView(Id, 1, 2, "5+3", GameStatus.Ended, "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3", 4, Side.White, "d8h4", "Qh4#", 290_000, 295_000, T0.AddSeconds(6), null, "0-1", EndReason.Checkmate, 6),
            view);
    }

    [Fact]
    public void A_list_item_carries_names_status_and_result()
    {
        GameListItem item = GameReads.ToListItem(Ended());

        Assert.Equal(new GameListItem(Id, 1, "testuser", 2, "player", "5+3", "ended", "0-1", EndReason.Checkmate, 4, T0, T0.AddSeconds(6)), item);
    }

    [Fact]
    public void My_game_is_seen_from_the_players_side()
    {
        RmGamePlayer me = new() { UserId = 2, GameId = Id, Color = "black", OpponentId = 1, OpponentName = "testuser", CreatedAt = T0 };

        MyGameItem item = GameReads.ToMyGame(me, Ended(), Week);

        Assert.Equal(new MyGameItem(Id, "black", 1, "testuser", "5+3", "ended", "0-1", EndReason.Checkmate, T0), item);
    }

    private static readonly TimeSpan Week = TimeSpan.FromDays(7);

    [Theory]
    [InlineData("white", 4, true)]
    [InlineData("black", 4, false)]
    [InlineData("black", 5, true)]
    public void It_is_my_turn_on_my_colours_plies_while_playing(string color, int ply, bool mine)
    {
        RmGame game = Ended();
        (game.Status, game.Ply, game.Result) = (RmGame.Playing, ply, null);
        RmGamePlayer me = new() { UserId = 2, GameId = Id, Color = color, OpponentId = 1, OpponentName = "testuser", CreatedAt = T0 };

        Assert.Equal(mine, GameReads.ToMyGame(me, game, Week).YourTurn);
        Assert.False(GameReads.ToMyGame(me, Ended(), Week).YourTurn); // an ended game is nobody's turn
    }

    [Fact]
    public void A_correspondence_game_being_played_has_a_deadline_a_week_after_its_last_move()
    {
        RmGame game = Ended();
        (game.Status, game.TimeControl, game.Result) = (RmGame.Playing, "7d", null);
        RmGamePlayer me = new() { UserId = 2, GameId = Id, Color = "black", OpponentId = 1, OpponentName = "testuser", CreatedAt = T0 };

        Assert.Equal(game.UpdatedAt + Week, GameReads.ToMyGame(me, game, Week).DeadlineAt);
        Assert.Null(GameReads.ToMyGame(me, Ended(), Week).DeadlineAt); // a live game has none
    }
}

