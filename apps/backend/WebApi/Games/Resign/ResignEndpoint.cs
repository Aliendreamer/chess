using Chess.Backend.Akka.Games;

namespace Chess.Backend.WebApi.Games;

/// <summary>Resigns the game.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ResignEndpoint(IRequiredActor<GameActor> region, ICurrentUser user) : GameEndpointBase<GameRouteRequest>(region)
{
    public override void Configure() => Standard("games/{id}/resign");

    public override Task HandleAsync(GameRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        return AskAsync(req, id => new Resign(id, user.Id ?? 0), ct);
    }
}
