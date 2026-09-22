using Chess.Backend.Akka.Ping;
using Chess.Backend.WebApi.Authentication;
using FluentValidation;

namespace Chess.Backend.WebApi.Pings;

internal sealed class PingRequest
{
    public string Text { get; init; } = string.Empty;
}

internal sealed class PingRequestValidator : Validator<PingRequest>
{
    public PingRequestValidator()
    {
        RuleFor(r => r.Text).NotEmpty().MaximumLength(200);
    }
}

/// <summary>Command: the reply is the actor's state (read-your-write), never a database read.</summary>
[ExcludeFromCodeCoverage]
internal sealed class PostPingEndpoint(IRequiredActor<PingActor> region, ICurrentUser user) : Endpoint<PingRequest, PingState>
{
    private static readonly TimeSpan AskTimeout = TimeSpan.FromSeconds(5);

    public override void Configure()
    {
        Post("pings/{id}");
        Description(d => d.WithTags("Pings")
            .Produces<PingState>()
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status502BadGateway)
            .Produces(StatusCodes.Status504GatewayTimeout));
    }

    public override async Task HandleAsync(PingRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        string id = Route<string>("id")!;
        try
        {
            PingIds.Validate(id);
        }
        catch (ArgumentException ex)
        {
            ThrowError(ex.Message, StatusCodes.Status400BadRequest);
            return;
        }

        object reply;
        try
        {
            reply = await region.ActorRef.Ask(new Ping(id, req.Text, user.Id ?? 0), AskTimeout, ct);
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

/// <summary>Live read straight from the actor: what the primary "knows" right now, replica lag irrelevant.</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetPingLiveEndpoint(IRequiredActor<PingActor> region) : EndpointWithoutRequest<PingState>
{
    private static readonly TimeSpan AskTimeout = TimeSpan.FromSeconds(5);

    public override void Configure()
    {
        Get("pings/{id}/live");
        Description(d => d.WithTags("Pings")
            .Produces<PingState>()
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status502BadGateway)
            .Produces(StatusCodes.Status504GatewayTimeout));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        string id = Route<string>("id")!;
        try
        {
            PingIds.Validate(id);
        }
        catch (ArgumentException ex)
        {
            ThrowError(ex.Message, StatusCodes.Status400BadRequest);
            return;
        }

        object reply;
        try
        {
            reply = await region.ActorRef.Ask(new GetPingState(id), AskTimeout, ct);
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
