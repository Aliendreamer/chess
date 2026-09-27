namespace Chess.Backend.WebApi.Auth;

/// <summary>
/// Completes the flow: verifies state↔PKCE cookie, exchanges the code, creates the server session, sets the
/// opaque cookie and redirects to the absolute app URL.
/// </summary>
[ExcludeFromCodeCoverage]
internal sealed class CallbackEndpoint(
    IKeycloakOidcClient oidc,
    ISessionStore sessions,
    SessionCookies cookies,
    IOptions<KeycloakOptions> keycloak,
    TimeProvider clock,
    ILogger<CallbackEndpoint> logger) : Endpoint<CallbackRequest>
{
    public override void Configure()
    {
        Get(Constants.Routes.Callback);
        Group<AuthGroup>();
        Description(d => d.Produces(StatusCodes.Status302Found).Produces(StatusCodes.Status400BadRequest));
    }

    public override async Task HandleAsync(CallbackRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        string? pkceCookie = HttpContext.Request.Cookies[cookies.PkceName];
        cookies.ClearPkce(HttpContext.Response);

        CallbackOutcome outcome = CallbackValidator.Validate(req, pkceCookie);
        if (outcome.Error is not null)
        {
            Log.CallbackRejected(logger, outcome.Error);
            ThrowError(outcome.Error, StatusCodes.Status400BadRequest);
        }

        TokenResponse tokens = await oidc.ExchangeCodeAsync(outcome.Code, outcome.Verifier, ct);
        if (!JwtSubjectReader.TryReadSubject(tokens.AccessToken, out string? subject))
        {
            ThrowError("Access token carries no subject.", StatusCodes.Status400BadRequest);
        }

        DateTimeOffset now = clock.GetUtcNow();
        DateTimeOffset accessExp = now.AddSeconds(tokens.ExpiresIn);
        DateTimeOffset? refreshExp = tokens.RefreshExpiresIn is > 0 ? now.AddSeconds(tokens.RefreshExpiresIn.Value) : null;
        string raw = await sessions.CreateAsync(subject, tokens.AccessToken, tokens.RefreshToken, accessExp, refreshExp, ct);
        cookies.SetSession(HttpContext.Response, raw, refreshExp ?? accessExp);

        string target = keycloak.Value.AppBaseUrl.TrimEnd('/') + outcome.ReturnTo;
        await Send.RedirectAsync(target, allowRemoteRedirects: true);
    }
}
