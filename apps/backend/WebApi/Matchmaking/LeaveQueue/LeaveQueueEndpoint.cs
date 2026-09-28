using Chess.Backend.Akka;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Extensions;

namespace Chess.Backend.WebApi.Matchmaking;

[ExcludeFromCodeCoverage]
internal sealed class LeaveQueueEndpoint(IRequiredActor<MatchmakingActor> matchmaker, ICurrentUser user, IOptions<ApiOptions> options)
    : Endpoint<LeaveQueueRequest>
{
    public override void Configure()
    {
        Delete("matchmaking/{tc}");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.ClearDefaultAccepts() // route and query only: a body-less POST must not be a 415
            .WithTags("Matchmaking")
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(LeaveQueueRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        await matchmaker.ActorRef.Ask(ActorTracing.Wrap(new LeaveQueue(user.Id ?? 0, req.TimeControl)), options.Value.AskTimeout, ct);
        await Send.NoContentAsync(ct);
    }
}
