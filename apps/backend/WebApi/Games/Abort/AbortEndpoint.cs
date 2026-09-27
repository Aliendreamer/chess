using Chess.Backend.Akka.Games;

namespace Chess.Backend.WebApi.Games;

/// <summary>Aborts the game.</summary>
[ExcludeFromCodeCoverage]
internal sealed class AbortEndpoint(IRequiredActor<GameActor> region, ICurrentUser user) : GameEndpointBase<GameRouteRequest>(region)
{
    public override void Configure() => Standard("games/{id}/abort");

    public override Task HandleAsync(GameRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        return AskAsync(req, id => new AbortGame(id, user.Id ?? 0), ct);
    }
}
