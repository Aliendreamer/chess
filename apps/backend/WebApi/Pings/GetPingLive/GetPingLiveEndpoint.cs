using Chess.Backend.Akka;
using Chess.Backend.Akka.Ping;
using Chess.Backend.Extensions;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Pings;

/// <summary>Live read straight from the actor: what the primary "knows" right now, replica lag irrelevant.</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetPingLiveEndpoint(IRequiredActor<PingActor> region, IOptions<ApiOptions> options)
    : Endpoint<GetPingLiveRequest, PingState>
{
    public override void Configure()
    {
        Get("pings/{id}/live");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Pings")
            .Produces<PingState>()
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status502BadGateway)
            .Produces(StatusCodes.Status504GatewayTimeout));
    }

    public override async Task HandleAsync(GetPingLiveRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = "no-store";
        object reply;
        try
        {
            reply = await region.ActorRef.Ask(ActorTracing.Wrap(new GetPingState(req.Id)), options.Value.AskTimeout, ct);
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
