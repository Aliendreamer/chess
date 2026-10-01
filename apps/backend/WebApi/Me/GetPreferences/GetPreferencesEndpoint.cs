using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Me;

/// <summary><c>GET api/me/preferences</c>: the signed-in user's display preferences (user-preferences).</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetPreferencesEndpoint(IPreferencesService preferences, ICurrentUser user) : EndpointWithoutRequest<Preferences>
{
    public override void Configure()
    {
        Get("me/preferences");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Identity").Produces<Preferences>().Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        await Send.OkAsync(await preferences.GetAsync(user.Id ?? 0, ct), ct);
    }
}
