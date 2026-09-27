using Chess.Backend.Akka.Games;

namespace Chess.Backend.WebApi.Games;

/// <summary>Makes a move for the player to move.</summary>
[ExcludeFromCodeCoverage]
internal sealed class MoveEndpoint(IRequiredActor<GameActor> region, ICurrentUser user) : GameEndpointBase<MoveRequest>(region)
{
    public override void Configure() => Standard("games/{id}/moves");

    public override Task HandleAsync(MoveRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        return AskAsync(req, id => new MakeMove(id, user.Id ?? 0, req.Uci), ct);
    }
}
