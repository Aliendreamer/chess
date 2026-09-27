using Chess.Backend.Akka.Matchmaking;

namespace Chess.Backend.WebApi.Matchmaking;

[ExcludeFromCodeCoverage]
internal sealed class CreateInviteEndpoint(IRequiredActor<InviteActor> region, ICurrentUser user) : InviteEndpointBase<CreateInviteRequest>(region)
{
    public override void Configure() => Standard("invites", success: StatusCodes.Status201Created);

    public override Task HandleAsync(CreateInviteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        // A random v4 id: the link is a bearer secret, so no timestamp prefix (matchmaking design D3).
        return AskAsync(new CreateInvite(Guid.NewGuid(), user.Id ?? 0, req.TimeControl, req.Color), StatusCodes.Status201Created, ct);
    }
}
