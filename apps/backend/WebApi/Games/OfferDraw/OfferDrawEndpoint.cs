using Chess.Backend.Akka.Games;

namespace Chess.Backend.WebApi.Games;

/// <summary>Offers a draw.</summary>
[ExcludeFromCodeCoverage]
internal sealed class OfferDrawEndpoint(IRequiredActor<GameActor> region, ICurrentUser user) : GameEndpointBase<GameRouteRequest>(region)
{
    public override void Configure() => Standard("games/{id}/draw/offer");

    public override Task HandleAsync(GameRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        return AskAsync(req, id => new OfferDraw(id, user.Id ?? 0), ct);
    }
}
