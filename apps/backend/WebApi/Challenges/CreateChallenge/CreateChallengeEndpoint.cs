using Chess.Backend.Akka;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Akka.Presence;
using Chess.Backend.Extensions;
using Chess.Backend.WebApi.Matchmaking;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Challenges;

/// <summary>
/// Challenges a member (club-members D2): the opponent must be an active member, online and not playing, with no
/// challenge to them already, and the challenger must have none out. The presence singleton reserves both ends
/// atomically; then the invite is made (a new id, reserved for the opponent, open 60 s). If that fails the reservation
/// is released. Answers the open invite, whose <c>invite:{id}</c> topic says how it ends.
/// </summary>
[ExcludeFromCodeCoverage]
internal sealed class CreateChallengeEndpoint(
    ProjectDbContext db,
    IRequiredActor<PresenceActor> presence,
    IRequiredActor<InviteActor> invites,
    ICurrentUser user,
    IOptions<ApiOptions> options) : Endpoint<CreateChallengeRequest, InviteView>
{
    public override void Configure()
    {
        Post("challenges");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Challenges")
            .Produces<InviteView>()
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict)
            .Produces(StatusCodes.Status504GatewayTimeout));
    }

    public override async Task HandleAsync(CreateChallengeRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        long me = user.Id ?? 0;
        if (req.OpponentId == me)
        {
            ThrowError(ChallengeHttp.Yourself, StatusCodes.Status409Conflict);
        }

        var opponent = await db.Users.AsNoTracking()
            .Where(u => u.Id == req.OpponentId && u.Id > 0)
            .Select(u => new { u.Username, u.Active })
            .SingleOrDefaultAsync(ct);
        if (opponent is null)
        {
            ThrowError(ChallengeHttp.NoSuchMember, StatusCodes.Status404NotFound);
            return;
        }

        string name = MemberDirectory.DisplayName(req.OpponentId, opponent.Username);
        if (!opponent.Active)
        {
            ThrowError(ChallengeHttp.Refusal(ChallengeRefusal.Offline, name), StatusCodes.Status409Conflict);
        }

        Guid inviteId = Guid.CreateVersion7();
        string from = string.IsNullOrEmpty(user.Username) ? MemberDirectory.DisplayName(me, null) : user.Username;
        object reserved;
        try
        {
            reserved = await presence.ActorRef.Ask(
                ActorTracing.Wrap(new TryReserveChallenge(inviteId, me, from, req.OpponentId, req.TimeControl, req.Color)), options.Value.AskTimeout, ct);
        }
        catch (AskTimeoutException)
        {
            ThrowError("Presence did not respond in time; try again.", StatusCodes.Status504GatewayTimeout);
            return;
        }

        if (reserved is ChallengeRefused refused)
        {
            ThrowError(ChallengeHttp.Refusal(refused.Reason, name), StatusCodes.Status409Conflict);
        }

        object reply;
        try
        {
            reply = await invites.ActorRef.Ask(
                ActorTracing.Wrap(new OfferChallenge(inviteId, me, req.OpponentId, req.TimeControl, req.Color)), options.Value.InviteAskTimeout, ct);
        }
        catch (AskTimeoutException)
        {
            presence.ActorRef.Tell(ActorTracing.Wrap(new ReleaseChallenge(inviteId)));
            ThrowError("The challenge could not be made in time; try again.", StatusCodes.Status504GatewayTimeout);
            return;
        }

        (int status, object? body, string? error) = InviteHttp.Map(reply);
        if (body is InviteView view)
        {
            await Send.OkAsync(view, ct);
            return;
        }

        presence.ActorRef.Tell(ActorTracing.Wrap(new ReleaseChallenge(inviteId)));
        ThrowError(error!, status);
    }
}
