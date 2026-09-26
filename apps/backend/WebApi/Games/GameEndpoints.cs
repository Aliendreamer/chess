using Chess.Backend.Akka.Games;
using Chess.Backend.WebApi.Authentication;

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

    /// <summary>Game ids travel in <c>N</c> form (32 lower-case hex), the same as live topics.</summary>
    public static bool TryParseId(string? text, out Guid id) =>
        Guid.TryParseExact(text, "N", out id) && string.Equals(id.ToString("N"), text, StringComparison.Ordinal);
}

/// <summary>
/// Shared plumbing for every game endpoint: parse the id, ask the games region (5 s), map the reply. Commands answer
/// with the actor's post-persist view (read-your-write), never a database read.
/// </summary>
[ExcludeFromCodeCoverage]
internal abstract class GameEndpointBase<TRequest>(IRequiredActor<GameActor> region) : Endpoint<TRequest, GameView>
    where TRequest : notnull
{
    private static readonly TimeSpan AskTimeout = TimeSpan.FromSeconds(5);

    protected async Task AskAsync(Func<Guid, object> command, CancellationToken ct)
    {
        if (!GameReplyMapper.TryParseId(Route<string>("id"), out Guid id))
        {
            ThrowError("Game id must be 32 lower-case hex digits.", StatusCodes.Status400BadRequest);
        }

        object reply;
        try
        {
            reply = await region.ActorRef.Ask(command(id), AskTimeout, ct);
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

    protected void Describe(string summary) => Description(d => d.WithTags("Games")
        .WithSummary(summary)
        .Produces<GameView>()
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status403Forbidden)
        .Produces(StatusCodes.Status404NotFound)
        .Produces(StatusCodes.Status409Conflict)
        .Produces(StatusCodes.Status422UnprocessableEntity)
        .Produces(StatusCodes.Status504GatewayTimeout));
}

internal sealed class MoveRequest
{
    /// <summary>UCI, e.g. <c>e2e4</c> or <c>e7e8q</c>.</summary>
    public string Uci { get; init; } = string.Empty;
}

[ExcludeFromCodeCoverage]
internal sealed class PostMoveEndpoint(IRequiredActor<GameActor> region, ICurrentUser user) : GameEndpointBase<MoveRequest>(region)
{
    public override void Configure()
    {
        Post("games/{id}/moves");
        Describe("Make a move (UCI) as the player to move.");
    }

    public override Task HandleAsync(MoveRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        return AskAsync(id => new MakeMove(id, user.Id ?? 0, req.Uci), ct);
    }
}

[ExcludeFromCodeCoverage]
internal sealed class ResignEndpoint(IRequiredActor<GameActor> region, ICurrentUser user) : GameEndpointBase<EmptyRequest>(region)
{
    public override void Configure()
    {
        Post("games/{id}/resign");
        Describe("Resign (after the first move).");
    }

    public override Task HandleAsync(EmptyRequest req, CancellationToken ct) => AskAsync(id => new Resign(id, user.Id ?? 0), ct);
}

[ExcludeFromCodeCoverage]
internal sealed class OfferDrawEndpoint(IRequiredActor<GameActor> region, ICurrentUser user) : GameEndpointBase<EmptyRequest>(region)
{
    public override void Configure()
    {
        Post("games/{id}/draw/offer");
        Describe("Offer a draw; offering against the opponent's pending offer accepts it.");
    }

    public override Task HandleAsync(EmptyRequest req, CancellationToken ct) => AskAsync(id => new OfferDraw(id, user.Id ?? 0), ct);
}

[ExcludeFromCodeCoverage]
internal sealed class AcceptDrawEndpoint(IRequiredActor<GameActor> region, ICurrentUser user) : GameEndpointBase<EmptyRequest>(region)
{
    public override void Configure()
    {
        Post("games/{id}/draw/accept");
        Describe("Accept the opponent's pending draw offer.");
    }

    public override Task HandleAsync(EmptyRequest req, CancellationToken ct) => AskAsync(id => new AcceptDraw(id, user.Id ?? 0), ct);
}

[ExcludeFromCodeCoverage]
internal sealed class DeclineDrawEndpoint(IRequiredActor<GameActor> region, ICurrentUser user) : GameEndpointBase<EmptyRequest>(region)
{
    public override void Configure()
    {
        Post("games/{id}/draw/decline");
        Describe("Decline the opponent's pending draw offer.");
    }

    public override Task HandleAsync(EmptyRequest req, CancellationToken ct) => AskAsync(id => new DeclineDraw(id, user.Id ?? 0), ct);
}

[ExcludeFromCodeCoverage]
internal sealed class AbortGameEndpoint(IRequiredActor<GameActor> region, ICurrentUser user) : GameEndpointBase<EmptyRequest>(region)
{
    public override void Configure()
    {
        Post("games/{id}/abort");
        Describe("Abort before your own first move.");
    }

    public override Task HandleAsync(EmptyRequest req, CancellationToken ct) => AskAsync(id => new AbortGame(id, user.Id ?? 0), ct);
}

/// <summary>The game's current view straight from its actor; any signed-in user may read it (D20).</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetGameLiveEndpoint(IRequiredActor<GameActor> region) : GameEndpointBase<EmptyRequest>(region)
{
    public override void Configure()
    {
        Get("games/{id}/live");
        Describe("The game's current state (players, position, clocks).");
    }

    public override Task HandleAsync(EmptyRequest req, CancellationToken ct) => AskAsync(id => new GetGameView(id), ct);
}
