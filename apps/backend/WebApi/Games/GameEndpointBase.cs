using Chess.Backend.Akka;
using Chess.Backend.Akka.Games;
using Chess.Backend.Extensions;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Games;

/// <summary>A request that names a game in its route (<c>games/{id}</c>); FastEndpoints binds <c>{id}</c> to <see cref="Id"/>.</summary>
internal interface IGameRoute
{
    string Id { get; }
}

/// <summary>
/// Shared plumbing for the game commands and the live view: ask the games region (<see cref="ApiOptions.AskTimeout"/>),
/// map the reply. Commands answer with the actor's post-persist view (read-your-write), never a database read, and
/// nothing here may be cached.
/// </summary>
[ExcludeFromCodeCoverage]
internal abstract class GameEndpointBase<TRequest>(IRequiredActor<GameActor> region) : Endpoint<TRequest, GameView>
    where TRequest : notnull, IGameRoute
{
    protected async Task AskAsync(TRequest req, Func<Guid, object> command, CancellationToken ct)
    {
        if (!GameReplyMapper.TryParseId(req.Id, out Guid id))
        {
            ThrowError("Game id must be a lower-case Guid, with or without dashes.", StatusCodes.Status400BadRequest);
        }

        HttpContext.Response.Headers[HeaderNames.CacheControl] = "no-store";
        object reply;
        try
        {
            reply = await region.ActorRef.Ask(ActorTracing.Wrap(command(id)), Resolve<IOptions<ApiOptions>>().Value.AskTimeout, ct);
        }
        catch (AskTimeoutException)
        {
            ThrowError("The game did not respond in time.", StatusCodes.Status504GatewayTimeout);
            return;
        }

        GameReplyOutcome outcome = GameReplyMapper.Map(reply);
        if (outcome.IsSuccess)
        {
            await Send.OkAsync(outcome.View!, ct);
        }
        else
        {
            ThrowError(outcome.Error!, outcome.StatusCode);
        }
    }

    /// <summary>Signed-in players (and spectators for the live view), the Games tag and every status a command can answer.</summary>
    protected void Standard(string route, bool get = false)
    {
        if (get)
        {
            Get(route);
        }
        else
        {
            Post(route);
        }

        Policies(Constants.Policies.SignedIn);
        // Route-only commands (resign, draw, abort) have no body: without this a body-less POST would be a 415.
        bool bodyless = typeof(TRequest) == typeof(GameRouteRequest);
        Description(d =>
        {
            if (bodyless)
            {
                d.ClearDefaultAccepts();
            }

            d.WithTags("Games")
            .Produces<GameView>()
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict)
            .Produces(StatusCodes.Status422UnprocessableEntity)
            .Produces(StatusCodes.Status504GatewayTimeout);
        });
    }
}
