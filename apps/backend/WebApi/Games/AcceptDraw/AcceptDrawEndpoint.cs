using Chess.Backend.Akka.Games;

namespace Chess.Backend.WebApi.Games;

/// <summary>Accepts the opponent's draw offer.</summary>
[ExcludeFromCodeCoverage]
internal sealed class AcceptDrawEndpoint(IRequiredActor<GameActor> region, ICurrentUser user) : GameEndpointBase<GameRouteRequest>(region)
{
    public override void Configure() => Standard("games/{id}/draw/accept");

    public override Task HandleAsync(GameRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        return AskAsync(req, id => new AcceptDraw(id, user.Id ?? 0), ct);
    }
}
