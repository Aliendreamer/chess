using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Invites;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.WebApi.Matchmaking;

namespace Chess.Backend.Tests.Matchmaking;

public sealed class ReplyMapperTests
{
    private static readonly Guid Game = Guid.Parse("0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f");
    private static readonly Guid Invite = Guid.Parse("7c9e6679-7425-40de-944b-e07fc1f90ae7");

    [Fact]
    public void Waiting_is_200_with_status_waiting() =>
        Assert.Equal(
            (200, new QueueStatus("waiting", "5+3", 1, 1, null, null, null, 4)),
            MatchmakingHttp.Map(new Waiting("5+3", 1, 1, 4)));

    [Fact]
    public void Matched_is_200_with_the_game() =>
        Assert.Equal(
            (200, new QueueStatus("matched", "5+3", null, null, Game, 1, 2, null)),
            MatchmakingHttp.Map(new Matched("5+3", Game, 1, 2)));

    [Fact]
    public void A_refused_queue_is_400() => Assert.Equal(400, MatchmakingHttp.Map(new QueueRejected("nope")).Status);

    [Fact]
    public void Leaving_is_204() => Assert.Equal(204, MatchmakingHttp.Map(new Left("5+3")).Status);

    [Fact]
    public void Anything_else_is_502() => Assert.Equal(502, MatchmakingHttp.Map("??").Status);

    [Theory]
    [InlineData("Forbidden", 403)]
    [InlineData("Illegal", 400)] // bad colour or time control: the request is wrong, not the move
    [InlineData("Conflict", 409)]
    [InlineData("NotFound", 404)]
    public void Invite_rejections_map_to_their_status(string code, int status) =>
        Assert.Equal(status, InviteHttp.Map(new InviteRejected(Invite, Enum.Parse<RejectionCode>(code), "why")).Status);

    [Fact]
    public void An_invite_view_is_200()
    {
        InviteView view = new(Invite, 1, "5+3", "white", "open", null, DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch.AddHours(24), 1);

        (int status, object? body, string? error) = InviteHttp.Map(view);

        Assert.Equal((200, (object?)view, (string?)null), (status, body, error));
    }
}
