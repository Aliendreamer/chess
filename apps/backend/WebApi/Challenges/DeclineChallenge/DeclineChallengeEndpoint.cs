using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Extensions;

namespace Chess.Backend.WebApi.Challenges;

/// <summary>The challenged member declines; the challenger sees it on invite:{id}. Only the challenged member.</summary>
[ExcludeFromCodeCoverage]
internal sealed class DeclineChallengeEndpoint(IRequiredActor<InviteActor> invites, ICurrentUser user, IOptions<ApiOptions> options)
    : ChallengeEndpointBase(invites, options)
{
    public override void Configure() => Standard("challenges/{id}/decline");

    public override Task HandleAsync(ChallengeRouteRequest req, CancellationToken ct) =>
        AskAsync(req, id => new DeclineChallenge(id, user.Id ?? 0), ct);
}
