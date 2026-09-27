using Chess.Backend.Akka.Games;

namespace Chess.Backend.WebApi.Games;

/// <summary>The game's current view; any signed-in user may watch (D20).</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetLiveEndpoint(IRequiredActor<GameActor> region) : GameEndpointBase<GameRouteRequest>(region)
{
    public override void Configure() => Standard("games/{id}/live", get: true);

    public override Task HandleAsync(GameRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        return AskAsync(req, id => new GetGameView(id), ct);
    }
}
