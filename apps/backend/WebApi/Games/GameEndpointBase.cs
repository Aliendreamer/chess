using Chess.Backend.Akka.Games;
using Chess.Backend.Extensions;
using FluentValidation;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Games;

internal sealed record GameReplyOutcome(bool IsSuccess, int StatusCode, GameView? View, string? Error);

/// <summary>Actor reply → HTTP: the one tested piece behind the thin game endpoints.</summary>
internal static class GameReplyMapper
{
    public static GameReplyOutcome Map(object reply) => reply switch
    {
        GameView view => new(true, StatusCodes.Status200OK, view, null),
        GameRejected r => new(false, r.Code switch
        {
            RejectionCode.Forbidden => StatusCodes.Status403Forbidden,
            RejectionCode.Illegal => StatusCodes.Status422UnprocessableEntity,
            RejectionCode.Conflict => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status404NotFound,
        }, null, r.Reason),
        _ => new(false, StatusCodes.Status502BadGateway, null, "Unexpected reply from the game."),
    };

    /// <summary>A claim body's outcome: <c>win</c> or <c>draw</c> (lower case), nothing else.</summary>
    public static bool TryParseClaim(string? outcome, out bool win)
    {
        win = outcome == "win";
        return outcome is "win" or "draw";
    }

    /// <summary>
    /// Route ids (games, invites) are lower-case Guids in <c>N</c> form (32 hex, as live topics spell them) or <c>D</c>
    /// form (with dashes, as JSON responses spell them), so an id from a response can be pasted straight into a URL.
    /// </summary>
    public static bool TryParseId(string? text, out Guid id) =>
        (Guid.TryParseExact(text, "N", out id) && string.Equals(id.ToString("N"), text, StringComparison.Ordinal))
        || (Guid.TryParseExact(text, "D", out id) && string.Equals(id.ToString("D"), text, StringComparison.Ordinal));
}

/// <summary>A request that names a game in its route (<c>games/{id}</c>); FastEndpoints binds <c>{id}</c> to <see cref="Id"/>.</summary>
internal interface IGameRoute
{
    string Id { get; }
}

/// <summary>The request of every game endpoint that takes only the route.</summary>
internal sealed class GameRouteRequest : IGameRoute
{
    /// <summary>The game id: a lower-case Guid, with or without dashes.</summary>
    public string Id { get; init; } = string.Empty;
}

internal static class GameRouteRules
{
    public static IRuleBuilderOptions<T, string> MustBeGameId<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(id => GameReplyMapper.TryParseId(id, out _)).WithMessage("Game id must be a lower-case Guid, with or without dashes.");
}

internal sealed class GameRouteRequestValidator : Validator<GameRouteRequest>
{
    public GameRouteRequestValidator() => RuleFor(r => r.Id).MustBeGameId();
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
            reply = await region.ActorRef.Ask(command(id), Resolve<IOptions<ApiOptions>>().Value.AskTimeout, ct);
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
