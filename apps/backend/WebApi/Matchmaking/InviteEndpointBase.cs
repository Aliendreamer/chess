using Chess.Backend.Akka;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Extensions;
using Chess.Backend.WebApi.Games;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Matchmaking;

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
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
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
