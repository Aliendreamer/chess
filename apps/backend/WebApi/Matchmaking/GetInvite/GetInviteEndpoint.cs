using Chess.Backend.Akka.Matchmaking;

namespace Chess.Backend.WebApi.Matchmaking;

[ExcludeFromCodeCoverage]
internal sealed class GetInviteEndpoint(IRequiredActor<InviteActor> region) : InviteEndpointBase<InviteRouteRequest>(region)
{
    public override void Configure() => Standard("invites/{id}", get: true);

    public override Task HandleAsync(InviteRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        return AskAsync(new GetInvite(ParseId(req.Id)), StatusCodes.Status200OK, ct);
    }
}
