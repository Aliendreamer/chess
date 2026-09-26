using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Invites;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.WebApi.Authentication;
using Chess.Backend.WebApi.Games;

namespace Chess.Backend.WebApi.Matchmaking;

/// <summary>What <c>POST /api/matchmaking/{tc}</c> answers: still waiting (with your place), or matched (with the game).</summary>
internal sealed record QueueStatus(
    string Status,
    string TimeControl,
    int? Position,
    int? Waiting,
    Guid? GameId,
    long? WhiteId,
    long? BlackId);

/// <summary>Matchmaking replies → HTTP (the tested piece behind the thin endpoints).</summary>
internal static class MatchmakingHttp
{
    public static (int Status, QueueStatus? Body) Map(object reply) => reply switch
    {
        Waiting w => (StatusCodes.Status200OK, new QueueStatus("waiting", w.TimeControl, w.Position, w.WaitingCount, null, null, null)),
        Matched m => (StatusCodes.Status200OK, new QueueStatus("matched", m.TimeControl, null, null, m.GameId, m.WhiteId, m.BlackId)),
        QueueRejected => (StatusCodes.Status400BadRequest, null),
        Left => (StatusCodes.Status204NoContent, null),
        _ => (StatusCodes.Status502BadGateway, null),
    };
}

/// <summary>Invite replies → HTTP. An invalid colour or time control is the request's fault: 400, not 422.</summary>
internal static class InviteHttp
{
    public static (int Status, object? Body, string? Error) Map(object reply) => reply switch
    {
        InviteView view => (StatusCodes.Status200OK, view, null),
        InviteRejected r => (r.Code switch
        {
            RejectionCode.Forbidden => StatusCodes.Status403Forbidden,
            RejectionCode.Illegal => StatusCodes.Status400BadRequest,
            RejectionCode.Conflict => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status404NotFound,
        }, null, r.Reason),
        _ => (StatusCodes.Status502BadGateway, null, "Unexpected reply."),
    };
}

/// <summary>Join (or heartbeat) a queue: re-POST every ~30 s while searching; silence for 60 s drops you.</summary>
[ExcludeFromCodeCoverage]
internal sealed class JoinQueueEndpoint(IRequiredActor<MatchmakingActor> matchmaker, ICurrentUser user) : EndpointWithoutRequest<QueueStatus>
{
    private static readonly TimeSpan AskTimeout = TimeSpan.FromSeconds(5);

    public override void Configure()
    {
        Post("matchmaking/{tc}");
        Description(d => d.WithTags("Matchmaking")
            .WithSummary("Join or keep alive a queue for a preset time control (e.g. 5+3). Answers waiting or matched.")
            .Produces<QueueStatus>().Produces(StatusCodes.Status400BadRequest).Produces(StatusCodes.Status504GatewayTimeout));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        object reply;
        try
        {
            reply = await matchmaker.ActorRef.Ask(new JoinQueue(user.Id ?? 0, Route<string>("tc")!), AskTimeout, ct);
        }
        catch (AskTimeoutException)
        {
            ThrowError("Matchmaking did not respond in time; retry.", StatusCodes.Status504GatewayTimeout);
            return;
        }

        (int status, QueueStatus? body) = MatchmakingHttp.Map(reply);
        if (body is null)
        {
            ThrowError(reply is QueueRejected r ? r.Reason : "Unexpected reply.", status);
        }

        await Send.OkAsync(body, ct);
    }
}

[ExcludeFromCodeCoverage]
internal sealed class LeaveQueueEndpoint(IRequiredActor<MatchmakingActor> matchmaker, ICurrentUser user) : EndpointWithoutRequest
{
    private static readonly TimeSpan AskTimeout = TimeSpan.FromSeconds(5);

    public override void Configure()
    {
        Delete("matchmaking/{tc}");
        Description(d => d.WithTags("Matchmaking").WithSummary("Leave a queue.").Produces(StatusCodes.Status204NoContent));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        await matchmaker.ActorRef.Ask(new LeaveQueue(user.Id ?? 0, Route<string>("tc")!), AskTimeout, ct);
        await Send.NoContentAsync(ct);
    }
}

internal sealed class CreateInviteRequest
{
    /// <summary>A preset, e.g. <c>5+3</c>.</summary>
    public string TimeControl { get; init; } = string.Empty;

    /// <summary><c>white</c>, <c>black</c> or <c>random</c>: the creator's colour.</summary>
    public string Color { get; init; } = "random";
}

/// <summary>Shared ask-and-map plumbing for the invite endpoints.</summary>
[ExcludeFromCodeCoverage]
internal abstract class InviteEndpointBase<TRequest>(IRequiredActor<InviteActor> region) : Endpoint<TRequest, InviteView>
    where TRequest : notnull
{
    private static readonly TimeSpan AskTimeout = TimeSpan.FromSeconds(10); // an accept starts a game

    protected Guid InviteId()
    {
        if (!GameReplyMapper.TryParseId(Route<string>("id"), out Guid id))
        {
            ThrowError("Invite id must be a lower-case Guid, with or without dashes.", StatusCodes.Status400BadRequest);
        }

        return id;
    }

    protected async Task AskAsync(object command, int successStatus, CancellationToken ct)
    {
        object reply;
        try
        {
            reply = await region.ActorRef.Ask(command, AskTimeout, ct);
        }
        catch (AskTimeoutException)
        {
            ThrowError("The invite did not respond in time.", StatusCodes.Status504GatewayTimeout);
            return;
        }

        (int status, object? body, string? error) = InviteHttp.Map(reply);
        if (body is InviteView view)
        {
            await Send.ResponseAsync(view, successStatus, ct);
            return;
        }

        ThrowError(error!, status);
    }

    protected void Describe(string summary) => Description(d => d.WithTags("Invites").WithSummary(summary)
        .Produces<InviteView>()
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status403Forbidden)
        .Produces(StatusCodes.Status404NotFound)
        .Produces(StatusCodes.Status409Conflict));
}

[ExcludeFromCodeCoverage]
internal sealed class CreateInviteEndpoint(IRequiredActor<InviteActor> region, ICurrentUser user) : InviteEndpointBase<CreateInviteRequest>(region)
{
    public override void Configure()
    {
        Post("invites");
        Describe("Create an invite link for a time control and your colour; it is open for 24 h.");
    }

    public override Task HandleAsync(CreateInviteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        // A random v4 id: the link is a bearer secret, so no timestamp prefix (design D3).
        return AskAsync(new CreateInvite(Guid.NewGuid(), user.Id ?? 0, req.TimeControl, req.Color), StatusCodes.Status201Created, ct);
    }
}

[ExcludeFromCodeCoverage]
internal sealed class GetInviteEndpoint(IRequiredActor<InviteActor> region) : InviteEndpointBase<EmptyRequest>(region)
{
    public override void Configure()
    {
        Get("invites/{id}");
        Describe("An invite's status (open, accepted with its game, cancelled or expired).");
    }

    public override Task HandleAsync(EmptyRequest req, CancellationToken ct) => AskAsync(new GetInvite(InviteId()), StatusCodes.Status200OK, ct);
}

[ExcludeFromCodeCoverage]
internal sealed class AcceptInviteEndpoint(IRequiredActor<InviteActor> region, ICurrentUser user) : InviteEndpointBase<EmptyRequest>(region)
{
    public override void Configure()
    {
        Post("invites/{id}/accept");
        Describe("Accept an open invite: the game starts and its id is in the answer.");
    }

    public override Task HandleAsync(EmptyRequest req, CancellationToken ct) => AskAsync(new AcceptInvite(InviteId(), user.Id ?? 0), StatusCodes.Status200OK, ct);
}

[ExcludeFromCodeCoverage]
internal sealed class CancelInviteEndpoint(IRequiredActor<InviteActor> region, ICurrentUser user) : InviteEndpointBase<EmptyRequest>(region)
{
    public override void Configure()
    {
        Post("invites/{id}/cancel");
        Describe("Cancel your open invite.");
    }

    public override Task HandleAsync(EmptyRequest req, CancellationToken ct) => AskAsync(new CancelInvite(InviteId(), user.Id ?? 0), StatusCodes.Status200OK, ct);
}
