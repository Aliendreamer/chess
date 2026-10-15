using Chess.Backend.Akka;
using Chess.Backend.Akka.Presence;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Members;

/// <summary>
/// The club's active members with their state (club-members D1): the rows from the primary (a deactivation shows at
/// once), the states from the presence singleton. When it does not answer within <see cref="MembersOptions.PresenceTimeout"/>
/// the list still loads, everyone offline and <c>presenceKnown</c> false. Live state: never cached.
/// </summary>
[ExcludeFromCodeCoverage]
internal sealed class ListMembersEndpoint(IMemberDirectory directory, IRequiredActor<PresenceActor> presence, IOptions<MembersOptions> options)
    : EndpointWithoutRequest<MembersView>
{
    public override void Configure()
    {
        Get("members");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Members")
            .Produces<MembersView>()
            .Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        Task<IReadOnlyList<MemberRow>> rows = directory.ActiveMembersAsync(ct);
        PresenceSnapshot? states = null;
        try
        {
            states = await presence.ActorRef.Ask(ActorTracing.Wrap(GetPresence.Instance), options.Value.PresenceTimeout, ct) as PresenceSnapshot;
        }
        catch (AskTimeoutException)
        {
            // Presence unknown: the list still loads, everyone offline.
        }

        await Send.OkAsync(MembersList.Build(await rows, states), ct);
    }
}
