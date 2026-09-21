using Chess.Backend.Data.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Auth;

/// <summary>
/// Turns the opaque session cookie into the bearer token JwtBearer validates, refreshing at the IdP when the
/// access token has expired. A real <c>Authorization</c> header always wins (API clients keep working).
/// </summary>
internal static class CookieBearerTokenResolver
{
    public static async Task OnMessageReceivedAsync(MessageReceivedContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        IServiceProvider services = context.HttpContext.RequestServices;
        string? token = await ResolveTokenAsync(
            context.Request,
            services.GetRequiredService<IOptions<SessionCookieOptions>>().Value.SessionName,
            services.GetRequiredService<ISessionStore>(),
            services.GetRequiredService<IKeycloakOidcClient>(),
            services.GetRequiredService<TimeProvider>(),
            services.GetRequiredService<IOptions<SessionStoreOptions>>().Value.AccessTokenLeeway,
            services.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(CookieBearerTokenResolver)),
            context.HttpContext.RequestAborted);
        if (token is not null)
        {
            context.Token = token;
        }
    }

    internal static async Task<string?> ResolveTokenAsync(
        HttpRequest request,
        string cookieName,
        ISessionStore store,
        IKeycloakOidcClient oidc,
        TimeProvider clock,
        TimeSpan leeway,
        ILogger logger,
        CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(store);
        ArgumentNullException.ThrowIfNull(oidc);
        ArgumentNullException.ThrowIfNull(clock);

        // 1. An explicit bearer header is the caller's choice; never override it.
        if (!string.IsNullOrEmpty(request.Headers[HeaderNames.Authorization]))
        {
            return null;
        }

        // 2. No cookie, or no live session behind it → anonymous.
        if (!request.Cookies.TryGetValue(cookieName, out string? raw) || string.IsNullOrEmpty(raw))
        {
            return null;
        }

        UserSession? session = await store.GetValidAsync(raw, ct);
        if (session is null)
        {
            return null;
        }

        // 3. Still fresh → use as is.
        DateTimeOffset now = clock.GetUtcNow();
        if (session.AccessTokenExpiresAt - leeway > now)
        {
            return session.AccessToken;
        }

        // 4. Expired but refreshable → refresh transparently.
        if (session.RefreshToken is null
            || (session.RefreshTokenExpiresAt is not null && session.RefreshTokenExpiresAt <= now))
        {
            return null;
        }

        long sessionId = session.Id;
        try
        {
            TokenResponse tokens = await oidc.RefreshAsync(session.RefreshToken, ct);
            DateTimeOffset accessExp = now.AddSeconds(tokens.ExpiresIn);
            DateTimeOffset? refreshExp = tokens.RefreshExpiresIn is > 0 ? now.AddSeconds(tokens.RefreshExpiresIn.Value) : null;
            await store.UpdateTokensAsync(sessionId, tokens.AccessToken, tokens.RefreshToken, accessExp, refreshExp, ct);
            return tokens.AccessToken;
        }
        catch (HttpRequestException ex)
        {
            // 5. The IdP refused (session ended at the IdP, client disabled, …) → anonymous; the row expires on its own.
            Log.RefreshFailed(logger, ex, sessionId);
            return null;
        }
    }
}
