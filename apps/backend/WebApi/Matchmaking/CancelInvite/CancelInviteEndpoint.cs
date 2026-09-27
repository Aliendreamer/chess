using Chess.Backend.Akka.Matchmaking;

namespace Chess.Backend.WebApi.Matchmaking;

[ExcludeFromCodeCoverage]
internal sealed class CancelInviteEndpoint(IRequiredActor<InviteActor> region, ICurrentUser user) : InviteEndpointBase<InviteRouteRequest>(region)
{
    public override void Configure() => Standard("invites/{id}/cancel");

    public override Task HandleAsync(InviteRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        return AskAsync(new CancelInvite(ParseId(req.Id), user.Id ?? 0), StatusCodes.Status200OK, ct);
    }
}
