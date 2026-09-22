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
        Post("pings/{id:regex(^[a-z0-9\\-]{{1,64}}$)}");
        Description(d => d.WithTags("Pings").Produces<PingState>().Produces(StatusCodes.Status400BadRequest));
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

        object reply = await region.ActorRef.Ask(new Ping(id, req.Text, user.Id ?? 0), AskTimeout, ct);
        switch (reply)
        {
            case PingState state:
                await Send.OkAsync(state, ct);
                break;
            case PingRejected rejected:
                ThrowError(rejected.Reason, StatusCodes.Status400BadRequest);
                break;
            default:
                ThrowError("Unexpected reply from ping actor.", StatusCodes.Status502BadGateway);
                break;
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
        Get("pings/{id:regex(^[a-z0-9\\-]{{1,64}}$)}/live");
        Description(d => d.WithTags("Pings").Produces<PingState>().Produces(StatusCodes.Status400BadRequest));
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

        PingState state = await region.ActorRef.Ask<PingState>(new GetPingState(id), AskTimeout, ct);
        await Send.OkAsync(state, ct);
    }
}
