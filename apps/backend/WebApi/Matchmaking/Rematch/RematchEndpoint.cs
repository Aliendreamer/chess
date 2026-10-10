using Chess.Backend.Akka;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Extensions;
using Chess.Backend.WebApi.Games;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Matchmaking;

/// <summary>
/// Asks for a rematch of a finished game (game-feedback): an invite whose id is the game's, reserved for the other
/// player. The first player's call creates it; the other player's call accepts it and starts the game, so the ask
/// gets <see cref="ApiOptions.InviteAskTimeout"/>. Nothing here may be cached.
/// </summary>
[ExcludeFromCodeCoverage]
internal sealed class RematchEndpoint(
    IRequiredActor<InviteActor> invites,
    IRequiredActor<GameActor> games,
    IEndedGameReader endedGames,
    ICurrentUser user,
    IOptions<ApiOptions> options) : Endpoint<GameRouteRequest, InviteView>
{
    public override void Configure()
    {
        Post("games/{id}/rematch");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.ClearDefaultAccepts() // route only: a body-less POST must not be a 415
            .WithTags("Games")
            .Produces<InviteView>()
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict)
            .Produces(StatusCodes.Status504GatewayTimeout));
    }

    public override async Task HandleAsync(GameRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        if (!GameReplyMapper.TryParseId(req.Id, out Guid gameId))
        {
            ThrowError("Game id must be a lower-case Guid, with or without dashes.", StatusCodes.Status400BadRequest);
        }

        GameView? game = await endedGames.ReadEndedAsync(gameId, ct)
            ?? await games.ActorRef.Ask(ActorTracing.Wrap(new GetGameView(gameId)), options.Value.AskTimeout, ct) as GameView;
        if (game is null)
        {
            ThrowError("No such game.", StatusCodes.Status404NotFound);
            return;
        }

        object reply = Rematch.Offer(game, user.Id ?? 0);
        if (reply is OfferRematch offer)
        {
            try
            {
                reply = await invites.ActorRef.Ask(ActorTracing.Wrap(offer), options.Value.InviteAskTimeout, ct);
            }
            catch (AskTimeoutException)
            {
                ThrowError("The invite did not respond in time.", StatusCodes.Status504GatewayTimeout);
                return;
            }
        }

        (int status, object? body, string? error) = InviteHttp.Map(reply);
        if (body is InviteView view)
        {
            await Send.OkAsync(view, ct);
            return;
        }

        ThrowError(error!, status);
    }
}
