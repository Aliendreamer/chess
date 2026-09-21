using Chess.Backend.Data.Auth;
using Chess.Backend.WebApi.Auth.Groups;

namespace Chess.Backend.WebApi.Auth.Callback;

internal sealed class CallbackRequest
{
    [QueryParam]
    public string? Code { get; init; }

    [QueryParam]
    public string? State { get; init; }

    [QueryParam]
    public string? Error { get; init; }
}

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

internal sealed record CallbackOutcome(string Code, string Verifier, string ReturnTo, string? Error)
{
    public static CallbackOutcome Fail(string error) => new(string.Empty, string.Empty, ReturnToSanitizer.Default, error);
}

/// <summary>Pure validation of the callback inputs, kept out of the endpoint so it is unit-testable.</summary>
internal static class CallbackValidator
{
    public static CallbackOutcome Validate(CallbackRequest request, string? pkceCookie)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (!string.IsNullOrEmpty(request.Error))
        {
            return CallbackOutcome.Fail($"IdP returned error '{request.Error}'.");
        }

        if (string.IsNullOrEmpty(request.Code))
        {
            return CallbackOutcome.Fail("Missing authorization code.");
        }

        if (!PkceValues.TryParseCookieValue(pkceCookie, out string cookieNonce, out string verifier))
        {
            return CallbackOutcome.Fail("Missing or malformed PKCE cookie.");
        }

        if (!OidcStateCodec.TryDecode(request.State, out OidcState? state))
        {
            return CallbackOutcome.Fail("Malformed state.");
        }

        if (!string.Equals(state.Nonce, cookieNonce, StringComparison.Ordinal))
        {
            return CallbackOutcome.Fail("State does not match this browser's login attempt.");
        }

        return new CallbackOutcome(request.Code, verifier, ReturnToSanitizer.Sanitize(state.ReturnTo), null);
    }
}
