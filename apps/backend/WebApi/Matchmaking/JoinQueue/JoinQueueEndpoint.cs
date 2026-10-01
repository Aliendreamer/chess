using Chess.Backend.Akka;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Extensions;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Matchmaking;

/// <summary>Joins a queue, or keeps your place with <c>?heartbeat=true</c>; silence for 60 s drops you.</summary>
[ExcludeFromCodeCoverage]
internal sealed class JoinQueueEndpoint(IRequiredActor<MatchmakingActor> matchmaker, ICurrentUser user, IOptions<ApiOptions> options)
    : Endpoint<JoinQueueRequest, JoinQueueResponse>
{
    public override void Configure()
    {
        Post("matchmaking/{tc}");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.ClearDefaultAccepts() // route and query only: a body-less POST must not be a 415
            .WithTags("Matchmaking")
            .Produces<JoinQueueResponse>()
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status504GatewayTimeout));
    }

    public override async Task HandleAsync(JoinQueueRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        object reply;
        try
        {
            reply = await matchmaker.ActorRef.Ask(ActorTracing.Wrap(new JoinQueue(user.Id ?? 0, req.TimeControl, req.Heartbeat)), options.Value.AskTimeout, ct);
        }
        catch (AskTimeoutException)
        {
            ThrowError("Matchmaking did not respond in time; retry.", StatusCodes.Status504GatewayTimeout);
            return;
        }

        (int status, JoinQueueResponse? body) = MatchmakingHttp.Map(reply);
        if (body is null)
        {
            ThrowError(reply is QueueRejected r ? r.Reason : "Unexpected reply.", status);
        }

        await Send.OkAsync(body, ct);
    }
}
