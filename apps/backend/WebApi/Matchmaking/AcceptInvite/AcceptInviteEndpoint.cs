using Chess.Backend.Akka.Matchmaking;

namespace Chess.Backend.WebApi.Matchmaking;

[ExcludeFromCodeCoverage]
internal sealed class AcceptInviteEndpoint(IRequiredActor<InviteActor> region, ICurrentUser user) : InviteEndpointBase<InviteRouteRequest>(region)
{
    public override void Configure() => Standard("invites/{id}/accept");

    public override Task HandleAsync(InviteRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        return AskAsync(new AcceptInvite(ParseId(req.Id), user.Id ?? 0), StatusCodes.Status200OK, ct);
    }
}
