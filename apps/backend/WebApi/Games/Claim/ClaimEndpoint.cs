using Chess.Backend.Akka.Games;

namespace Chess.Backend.WebApi.Games;

/// <summary>Ends a game by abandonment.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ClaimEndpoint(IRequiredActor<GameActor> region, ICurrentUser user) : GameEndpointBase<ClaimRequest>(region)
{
    public override void Configure() => Standard("games/{id}/claim");

    public override Task HandleAsync(ClaimRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        return AskAsync(req, id => new ClaimAbandonment(id, user.Id ?? 0, req.Outcome == "win"), ct);
    }
}
