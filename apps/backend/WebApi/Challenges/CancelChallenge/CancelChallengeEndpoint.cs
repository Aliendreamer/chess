using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Extensions;

namespace Chess.Backend.WebApi.Challenges;

/// <summary>The challenger withdraws the challenge; it leaves the other member's banner. Only the challenger.</summary>
[ExcludeFromCodeCoverage]
internal sealed class CancelChallengeEndpoint(IRequiredActor<InviteActor> invites, ICurrentUser user, IOptions<ApiOptions> options)
    : ChallengeEndpointBase(invites, options)
{
    public override void Configure() => Standard("challenges/{id}/cancel");

    public override Task HandleAsync(ChallengeRouteRequest req, CancellationToken ct) =>
        AskAsync(req, id => new CancelChallenge(id, user.Id ?? 0), ct);
}
