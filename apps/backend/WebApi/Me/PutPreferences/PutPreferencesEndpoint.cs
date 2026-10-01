using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Me;

/// <summary><c>PUT api/me/preferences</c>: replaces the signed-in user's display preferences (user-preferences).</summary>
[ExcludeFromCodeCoverage]
internal sealed class PutPreferencesEndpoint(IPreferencesService preferences, ICurrentUser user) : Endpoint<PutPreferencesRequest, Preferences>
{
    public override void Configure()
    {
        Put("me/preferences");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Identity")
            .Produces<Preferences>()
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(PutPreferencesRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        Preferences? saved = await preferences.SetAsync(user.Id ?? 0, req.ToPreferences(), ct);
        if (saved is null)
        {
            ThrowError(req.ToPreferences().Problem() ?? "These preferences could not be saved.", StatusCodes.Status400BadRequest);
        }

        await Send.OkAsync(saved, ct);
    }
}
