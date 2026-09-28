using Chess.Backend.Akka;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Extensions;
using Chess.Backend.WebApi.Games;
using FluentValidation;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Matchmaking;

/// <summary>Matchmaking replies → HTTP (the tested piece behind the thin endpoints).</summary>
internal static class MatchmakingHttp
{
    public static (int Status, JoinQueueResponse? Body) Map(object reply) => reply switch
    {
        Waiting w => (StatusCodes.Status200OK, new JoinQueueResponse("waiting", w.TimeControl, w.Position, w.WaitingCount, null, null, null, w.Seq)),
        Matched m => (StatusCodes.Status200OK, new JoinQueueResponse("matched", m.TimeControl, null, null, m.GameId, m.WhiteId, m.BlackId, null)),
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

/// <summary>The shared rules of the matchmaking requests.</summary>
internal static class MatchmakingRules
{
    public static IRuleBuilderOptions<T, string> MustBePreset<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(tc => Chess.Backend.Games.TimeControl.TryParse(tc, out _)).WithMessage("Not a preset time control (e.g. 5+3).");

    public static IRuleBuilderOptions<T, string> MustBeInviteTimeControl<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(tc => Chess.Backend.Games.TimeControl.TryParseInvite(tc, out _)).WithMessage("Not a preset time control (e.g. 5+3) or 7d.");

    public static IRuleBuilderOptions<T, string> MustBeInviteId<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(id => GameReplyMapper.TryParseId(id, out _)).WithMessage("Invite id must be a lower-case Guid, with or without dashes.");
}

/// <summary>The request of the invite endpoints that take only the route (<c>invites/{id}</c>).</summary>
internal sealed class InviteRouteRequest
{
    /// <summary>The invite id: a lower-case Guid, with or without dashes.</summary>
    public string Id { get; init; } = string.Empty;
}

internal sealed class InviteRouteRequestValidator : Validator<InviteRouteRequest>
{
    public InviteRouteRequestValidator() => RuleFor(r => r.Id).MustBeInviteId();
}

/// <summary>
/// Shared ask-and-map plumbing for the invite endpoints (<see cref="ApiOptions.InviteAskTimeout"/>: an accept starts a
/// game). Nothing here may be cached.
/// </summary>
[ExcludeFromCodeCoverage]
internal abstract class InviteEndpointBase<TRequest>(IRequiredActor<InviteActor> region) : Endpoint<TRequest, InviteView>
    where TRequest : notnull
{
    protected Guid ParseId(string id)
    {
        if (!GameReplyMapper.TryParseId(id, out Guid parsed))
        {
            ThrowError("Invite id must be a lower-case Guid, with or without dashes.", StatusCodes.Status400BadRequest);
        }

        return parsed;
    }

    protected async Task AskAsync(object command, int successStatus, CancellationToken ct)
    {
        HttpContext.Response.Headers[HeaderNames.CacheControl] = "no-store";
        object reply;
        try
        {
            reply = await region.ActorRef.Ask(ActorTracing.Wrap(command), Resolve<IOptions<ApiOptions>>().Value.InviteAskTimeout, ct);
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

    protected void Standard(string route, bool get = false, int success = StatusCodes.Status200OK)
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
        // Accept and cancel carry only the route: without this a body-less POST would be a 415.
        bool bodyless = typeof(TRequest) == typeof(InviteRouteRequest);
        Description(d =>
        {
            if (bodyless)
            {
                d.ClearDefaultAccepts();
            }

            d.WithTags("Invites")
            .Produces<InviteView>(success)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict)
            .Produces(StatusCodes.Status504GatewayTimeout);
        });
    }
}
