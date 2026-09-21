using Chess.Backend.Data.Auth;
using Chess.Backend.WebApi.Auth.Groups;

namespace Chess.Backend.WebApi.Auth.Logout;

/// <summary>Revokes the server session (the old cookie is dead from here on), then ends the IdP session.</summary>
[ExcludeFromCodeCoverage]
internal sealed class LogoutEndpoint(IKeycloakOidcClient oidc, ISessionStore sessions, SessionCookies cookies)
    : EndpointWithoutRequest
{
    public override void Configure()
    {
        Get(Constants.Routes.Logout);
        Group<AuthGroup>();
        Description(d => d.Produces(StatusCodes.Status302Found));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        string? raw = HttpContext.Request.Cookies[cookies.SessionName];
        UserSession? session = raw is null ? null : await sessions.RevokeAsync(raw, ct);
        cookies.ClearSession(HttpContext.Response);

        if (session?.RefreshToken is { Length: > 0 } refreshToken)
        {
            await oidc.RevokeRefreshTokenAsync(refreshToken, ct);
        }

        string url = await oidc.BuildEndSessionUrlAsync(idTokenHint: null, ct);
        await Send.RedirectAsync(url, allowRemoteRedirects: true);
    }
}
