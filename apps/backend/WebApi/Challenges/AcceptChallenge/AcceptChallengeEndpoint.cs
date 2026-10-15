using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Extensions;

namespace Chess.Backend.WebApi.Challenges;

/// <summary>The challenged member accepts: the game starts with the challenger on their colour; the answer carries its id. Only the challenged member.</summary>
[ExcludeFromCodeCoverage]
internal sealed class AcceptChallengeEndpoint(IRequiredActor<InviteActor> invites, ICurrentUser user, IOptions<ApiOptions> options)
    : ChallengeEndpointBase(invites, options)
{
    public override void Configure() => Standard("challenges/{id}/accept");

    public override Task HandleAsync(ChallengeRouteRequest req, CancellationToken ct) =>
        AskAsync(req, id => new AcceptChallenge(id, user.Id ?? 0), ct);
}
