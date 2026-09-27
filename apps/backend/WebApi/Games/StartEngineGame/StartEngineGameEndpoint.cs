using Chess.Backend.Akka.Games;
using Chess.Backend.Extensions;
using Chess.Backend.Games;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Games;

/// <summary>Starts an untimed game against the engine at the chosen level (engine-play D2–D4, D7).</summary>
[ExcludeFromCodeCoverage]
internal sealed class StartEngineGameEndpoint(IRequiredActor<GameActor> region, ICurrentUser user, IOptions<ApiOptions> api)
    : Endpoint<StartEngineGameRequest, GameView>
{
    public override void Configure()
    {
        Post("engine-games");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Games")
            .Produces<GameView>(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status504GatewayTimeout));
    }

    public override async Task HandleAsync(StartEngineGameRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = "no-store";
        (long whiteId, long blackId, Events.EnginePlayer engine) = EngineLevel.Find(req.Level)!.Seat(user.Id ?? 0, req.Color, () => Random.Shared.Next(2) == 0);
        object reply;
        try
        {
            reply = await region.ActorRef.Ask(new CreateGame(Guid.CreateVersion7(), whiteId, blackId, TimeControl.Untimed, engine), api.Value.AskTimeout, ct);
        }
        catch (AskTimeoutException)
        {
            ThrowError("The game did not respond in time.", StatusCodes.Status504GatewayTimeout);
            return;
        }

        GameReplyOutcome outcome = GameReplyMapper.Map(reply);
        if (!outcome.IsSuccess)
        {
            ThrowError(outcome.Error!, outcome.StatusCode);
        }

        await Send.ResponseAsync(outcome.View!, StatusCodes.Status201Created, ct);
    }
}
