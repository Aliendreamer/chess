using Chess.Backend.WebApi.Games;
using FluentValidation.TestHelper;

namespace Chess.Backend.Tests.Games;

public sealed class GameValidatorsTests
{
    private const string Id = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f";

    [Theory]
    [InlineData("e2e4", true)]
    [InlineData("e7e8q", true)]
    [InlineData("zz", false)] // malformed: 400 here, never asked of the game
    [InlineData("e2e4k", false)]
    [InlineData("", false)]
    public void A_move_must_be_uci(string uci, bool ok) =>
        Assert.Equal(ok, new MoveRequestValidator().TestValidate(new MoveRequest { Id = Id, Uci = uci }).IsValid);

    [Theory]
    [InlineData(Id, true)]
    [InlineData("0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f", true)]
    [InlineData("0199F1C2A3B47C5D8E9F0A1B2C3D4E5F", false)]
    [InlineData("nope", false)]
    public void A_game_route_needs_a_lower_case_guid(string id, bool ok) =>
        Assert.Equal(ok, new GameRouteRequestValidator().TestValidate(new GameRouteRequest { Id = id }).IsValid);

    [Theory]
    [InlineData("win", true)]
    [InlineData("draw", true)]
    [InlineData("WIN", false)]
    [InlineData("", false)]
    public void A_claim_is_a_win_or_a_draw(string outcome, bool ok) =>
        Assert.Equal(ok, new ClaimRequestValidator().TestValidate(new ClaimRequest { Id = Id, Outcome = outcome }).IsValid);

    [Fact]
    public void A_game_list_needs_a_list_status_a_positive_limit_and_a_readable_cursor()
    {
        ListGamesRequestValidator v = new();
        v.TestValidate(new ListGamesRequest { Status = "aborted" }).ShouldHaveValidationErrorFor(r => r.Status);
        v.TestValidate(new ListGamesRequest { Status = "ended", Limit = 0 }).ShouldHaveValidationErrorFor(r => r.Limit);
        v.TestValidate(new ListGamesRequest { Status = "ended", Cursor = "not a cursor" }).ShouldHaveValidationErrorFor(r => r.Cursor);
        v.TestValidate(new ListGamesRequest { Status = "playing" }).ShouldNotHaveAnyValidationErrors();
        new MyGamesRequestValidator().TestValidate(new MyGamesRequest { Cursor = "not a cursor" }).ShouldHaveValidationErrorFor(r => r.Cursor);
    }

    [Theory]
    [InlineData("1320", "white", true)]
    [InlineData("max", "random", true)]
    [InlineData("1800", "white", false)] // not a level: 400, no game
    [InlineData("MAX", "white", false)]
    [InlineData("2000", "green", false)]
    public void An_engine_game_needs_a_level_and_a_colour(string level, string color, bool ok) =>
        Assert.Equal(ok, new StartEngineGameRequestValidator().TestValidate(new StartEngineGameRequest { Level = level, Color = color }).IsValid);

    [Theory]
    [InlineData(null, true)]
    [InlineData("mine", true)]
    [InlineData("theirs", false)]
    public void My_games_filter_only_by_my_turn(string? turn, bool ok) =>
        Assert.Equal(ok, new MyGamesRequestValidator().TestValidate(new MyGamesRequest { Turn = turn }).IsValid);
}

