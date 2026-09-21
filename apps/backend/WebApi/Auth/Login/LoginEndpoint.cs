using Chess.Backend.Data.Auth;
using Chess.Backend.WebApi.Auth.Groups;

namespace Chess.Backend.WebApi.Auth.Login;

internal sealed class LoginRequest
{
    [QueryParam]
    public string? ReturnTo { get; init; }
}

/// <summary>Starts the PKCE authorization-code flow and bounces the browser to Keycloak.</summary>
[ExcludeFromCodeCoverage]
internal sealed class LoginEndpoint(IKeycloakOidcClient oidc, SessionCookies cookies, TimeProvider clock)
    : Endpoint<LoginRequest>
{
    public override void Configure()
    {
        Get(Constants.Routes.Login);
        Group<AuthGroup>();
        Description(d => d.Produces(StatusCodes.Status302Found));
    }

    public override async Task HandleAsync(LoginRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        string returnTo = ReturnToSanitizer.Sanitize(req.ReturnTo);
        PkceValues pkce = Pkce.Create();
        cookies.SetPkce(HttpContext.Response, pkce, clock.GetUtcNow());
        string state = OidcStateCodec.Encode(new OidcState(pkce.Nonce, returnTo));
        string url = await oidc.BuildAuthorizeUrlAsync(state, pkce.Challenge, pkce.Nonce, ct);
        await Send.RedirectAsync(url, allowRemoteRedirects: true);
    }
}
