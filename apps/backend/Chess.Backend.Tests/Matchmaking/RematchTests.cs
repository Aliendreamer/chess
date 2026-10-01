using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Games;

namespace Chess.Backend.Tests.Matchmaking;

/// <summary>Who may ask for a rematch of a game, and the invite it becomes (game-feedback).</summary>
public sealed class RematchTests
{
    private const long White = 4;
    private const long Black = 5;

    private static GameView Game(GameStatus status = GameStatus.Ended, string? engineSide = null) => new(
        Guid.CreateVersion7(), White, Black, "3+2", status, "fen", 40, Side.White, null, null, 0, 0,
        DateTimeOffset.UnixEpoch, null, "1-0", null, 41, EngineSide: engineSide);

    [Fact]
    public void White_asks_and_will_play_black_against_the_same_opponent()
    {
        GameView game = Game();

        OfferRematch offer = Assert.IsType<OfferRematch>(Rematch.Offer(game, White));

        Assert.Equal(new OfferRematch(game.GameId, White, Black, "3+2", "black"), offer);
    }

    [Fact]
    public void Black_asks_and_will_play_white() =>
        Assert.Equal("white", Assert.IsType<OfferRematch>(Rematch.Offer(Game(), Black)).Color);

    [Fact]
    public void A_spectator_is_forbidden() =>
        Assert.Equal(RejectionCode.Forbidden, Assert.IsType<InviteRejected>(Rematch.Offer(Game(), 99)).Code);

    [Fact]
    public void A_game_still_on_is_a_conflict() =>
        Assert.Equal(RejectionCode.Conflict, Assert.IsType<InviteRejected>(Rematch.Offer(Game(GameStatus.Playing), White)).Code);

    [Fact]
    public void A_game_against_the_computer_is_refused() =>
        Assert.Equal(RejectionCode.Illegal, Assert.IsType<InviteRejected>(Rematch.Offer(Game(engineSide: "black"), White)).Code);
}
