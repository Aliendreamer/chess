using Chess.Backend.Akka;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Extensions;

namespace Chess.Backend.WebApi.Matchmaking;

/// <summary>
/// Asks for a rematch of a finished game (game-feedback): an invite whose id is the game's, reserved for the other
/// player. The first player's call creates it; the other player's call accepts it and starts the game.
/// </summary>
[ExcludeFromCodeCoverage]
internal sealed class RematchEndpoint(
    IRequiredActor<InviteActor> invites,
    IRequiredActor<GameActor> games,
    IEndedGameReader endedGames,
    ICurrentUser user) : InviteEndpointBase<InviteRouteRequest>(invites)
{
    public override void Configure() => Standard("games/{id}/rematch");

    public override async Task HandleAsync(InviteRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        Guid gameId = ParseId(req.Id);
        GameView? game = await endedGames.ReadEndedAsync(gameId, ct)
            ?? await games.ActorRef.Ask(ActorTracing.Wrap(new GetGameView(gameId)), Resolve<IOptions<ApiOptions>>().Value.AskTimeout, ct) as GameView;
        if (game is null)
        {
            ThrowError("No such game.", StatusCodes.Status404NotFound);
            return;
        }

        object offer = Rematch.Offer(game, user.Id ?? 0);
        if (offer is InviteRejected rejected)
        {
            (int status, _, string? error) = InviteHttp.Map(rejected);
            ThrowError(error!, status);
            return;
        }

        await AskAsync(offer, StatusCodes.Status200OK, ct);
    }
}
