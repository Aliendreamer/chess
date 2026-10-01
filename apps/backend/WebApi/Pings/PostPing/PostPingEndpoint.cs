using Chess.Backend.Akka;
using Chess.Backend.Akka.Ping;
using Chess.Backend.Extensions;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Pings;

/// <summary>Command: the reply is the actor's state (read-your-write), never a database read.</summary>
[ExcludeFromCodeCoverage]
internal sealed class PostPingEndpoint(IRequiredActor<PingActor> region, ICurrentUser user, IOptions<ApiOptions> options)
    : Endpoint<PostPingRequest, PingState>
{
    public override void Configure()
    {
        Post("pings/{id}");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Pings")
            .Produces<PingState>()
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status502BadGateway)
            .Produces(StatusCodes.Status504GatewayTimeout));
    }

    public override async Task HandleAsync(PostPingRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        object reply;
        try
        {
            reply = await region.ActorRef.Ask(ActorTracing.Wrap(new Ping(req.Id, req.Text, user.Id ?? 0)), options.Value.AskTimeout, ct);
        }
        catch (AskTimeoutException)
        {
            ThrowError("Ping entity did not respond in time.", StatusCodes.Status504GatewayTimeout);
            return;
        }

        PingReplyOutcome outcome = PingReplyMapper.Map(reply);
        if (outcome.IsSuccess)
        {
            await Send.OkAsync(outcome.State!, ct);
        }
        else
        {
            ThrowError(outcome.ErrorMessage!, outcome.ErrorStatusCode);
        }
    }
}
