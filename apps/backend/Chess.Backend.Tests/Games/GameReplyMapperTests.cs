using Chess.Backend.Akka.Games;
using Chess.Backend.WebApi.Games;

namespace Chess.Backend.Tests.Games;

public sealed class GameReplyMapperTests
{
    private static readonly Guid Id = Guid.CreateVersion7();

    [Fact]
    public void A_view_is_200()
    {
        GameView view = new(Id, 1, 2, "5+3", GameStatus.Playing, "fen", 1, "Black", "e2e4", "e4", 1, 2, DateTimeOffset.UnixEpoch, null, null, null, 2);

        GameReplyOutcome outcome = GameReplyMapper.Map(view);

        Assert.Equal((true, 200), (outcome.IsSuccess, outcome.StatusCode));
        Assert.Same(view, outcome.View);
    }

    [Theory]
    [InlineData("Forbidden", 403)]
    [InlineData("Illegal", 422)]
    [InlineData("Conflict", 409)]
    [InlineData("NotFound", 404)]
    public void Rejections_map_to_their_status_with_the_reason(string code, int status)
    {
        GameReplyOutcome outcome = GameReplyMapper.Map(new GameRejected(Id, Enum.Parse<RejectionCode>(code), "because"));

        Assert.Equal((false, status, "because"), (outcome.IsSuccess, outcome.StatusCode, outcome.Error));
    }

    [Fact]
    public void Anything_else_is_a_bad_gateway() =>
        Assert.Equal(502, GameReplyMapper.Map("??").StatusCode);

    [Theory]
    [InlineData("0199f1c2a3b47c5d8e9f0a1b2c3d4e5f", true)]
    [InlineData("0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f", true)] // as JSON responses spell it
    [InlineData("0199F1C2A3B47C5D8E9F0A1B2C3D4E5F", false)]
    [InlineData("{0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f}", false)]
    [InlineData("nope", false)]
    public void Route_ids_are_lower_case_guids_with_or_without_dashes(string text, bool ok) =>
        Assert.Equal(ok, GameReplyMapper.TryParseId(text, out _));

    [Fact]
    public void Both_forms_name_the_same_id()
    {
        GameReplyMapper.TryParseId("0199f1c2a3b47c5d8e9f0a1b2c3d4e5f", out Guid n);
        GameReplyMapper.TryParseId("0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f", out Guid d);

        Assert.Equal(n, d);
    }
}
