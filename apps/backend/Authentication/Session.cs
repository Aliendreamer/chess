using System.Security.Cryptography;
using System.Text;
using Chess.Backend.Extensions;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.Authentication;

/// <summary>The opaque cookie value: 256 random bits. Only its SHA-256 is persisted.</summary>
internal static class SessionToken
{
    private const int TokenBytes = 32;

    public static string Generate() => Base64Url.Encode(RandomNumberGenerator.GetBytes(TokenBytes));

    public static string Hash(string rawToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(rawToken);
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));
    }
}

/// <summary>Writes and clears the two auth cookies with one consistent policy.</summary>
internal sealed class SessionCookies(
    IOptions<SessionCookieOptions> cookieOptions,
    IOptions<SessionStoreOptions> storeOptions,
    IHostEnvironment environment)
{
    private readonly SessionCookieOptions _cookies = cookieOptions.Value;
    private readonly SessionStoreOptions _store = storeOptions.Value;

    public string SessionName => _cookies.SessionName;

    public string PkceName => _cookies.PkceName;

    public void SetSession(HttpResponse response, string rawToken, DateTimeOffset expires)
    {
        ArgumentNullException.ThrowIfNull(response);
        response.Cookies.Append(_cookies.SessionName, rawToken, Build(expires));
    }

    public void ClearSession(HttpResponse response)
    {
        ArgumentNullException.ThrowIfNull(response);
        response.Cookies.Delete(_cookies.SessionName, Build(null));
    }

    public void SetPkce(HttpResponse response, PkceValues pkce, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(response);
        ArgumentNullException.ThrowIfNull(pkce);
        response.Cookies.Append(_cookies.PkceName, pkce.ToCookieValue(), Build(now + _store.PkceLifetime));
    }

    public void ClearPkce(HttpResponse response)
    {
        ArgumentNullException.ThrowIfNull(response);
        response.Cookies.Delete(_cookies.PkceName, Build(null));
    }

    internal CookieOptions Build(DateTimeOffset? expires)
    {
        CookieOptions options = new()
        {
            HttpOnly = true,
            SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Lax,
            Path = "/",
            Secure = !environment.IsDevelopment(),
            IsEssential = true,
        };
        if (!string.IsNullOrEmpty(_cookies.Domain))
        {
            options.Domain = _cookies.Domain;
        }

        if (expires is not null)
        {
            options.Expires = expires;
        }

        return options;
    }
}

internal sealed class SessionCookieOptions : ISettings
{
    public const string SectionName = "SessionCookies";

    /// <summary>Cookie <c>Domain</c>; empty means host-only.</summary>
    public string Domain { get; set; } = string.Empty;

    public string SessionName { get; set; } = Constants.Cookies.DefaultSessionName;

    public string PkceName { get; set; } = Constants.Cookies.DefaultPkceName;

    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(SessionName) || string.IsNullOrWhiteSpace(PkceName))
        {
            throw new InvalidOperationException("SessionCookies:SessionName and SessionCookies:PkceName must be set.");
        }
    }
}

internal sealed class SessionStoreOptions : ISettings
{
    public const string SectionName = "SessionStore";

    /// <summary>How often the cleanup service purges revoked/expired sessions.</summary>
    public TimeSpan CleanupInterval { get; set; } = TimeSpan.FromMinutes(15);

    /// <summary>How long a revoked/expired row is kept before purge (audit window).</summary>
    public TimeSpan PurgeGrace { get; set; } = TimeSpan.FromDays(1);

    /// <summary>Lifetime of the PKCE cookie between login and callback.</summary>
    public TimeSpan PkceLifetime { get; set; } = TimeSpan.FromMinutes(10);

    /// <summary>Refresh the access token this long before it actually expires.</summary>
    public TimeSpan AccessTokenLeeway { get; set; } = TimeSpan.FromSeconds(30);

    public void Validate()
    {
        if (CleanupInterval <= TimeSpan.Zero || PkceLifetime <= TimeSpan.Zero || PurgeGrace < TimeSpan.Zero || AccessTokenLeeway < TimeSpan.Zero)
        {
            throw new InvalidOperationException(
                "SessionStore:CleanupInterval and SessionStore:PkceLifetime must be positive; PurgeGrace and AccessTokenLeeway not negative.");
        }
    }
}

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

internal interface ISessionStore : IService
{
    /// <summary>Creates a session and returns the RAW token to put in the cookie. Only its hash is stored.</summary>
    Task<string> CreateAsync(
        string subject,
        string accessToken,
        string? refreshToken,
        DateTimeOffset accessTokenExpiresAt,
        DateTimeOffset? refreshTokenExpiresAt,
        CancellationToken ct);

    /// <summary>Resolves a raw token to a live session: not revoked, and at least one token still usable.</summary>
    Task<UserSession?> GetValidAsync(string rawToken, CancellationToken ct);

    Task UpdateTokensAsync(
        long sessionId,
        string accessToken,
        string? refreshToken,
        DateTimeOffset accessTokenExpiresAt,
        DateTimeOffset? refreshTokenExpiresAt,
        CancellationToken ct);

    /// <summary>Revokes the session behind a raw token; returns it (for IdP back-channel logout) or null.</summary>
    Task<UserSession?> RevokeAsync(string rawToken, CancellationToken ct);

    Task<int> RevokeAllForSubjectAsync(string subject, CancellationToken ct);

    /// <summary>Deletes revoked/expired sessions older than the grace window. Returns the number removed.</summary>
    Task<int> PurgeAsync(TimeSpan grace, CancellationToken ct);
}

internal sealed class SessionStore(
    ProjectDbContext context,
    TimeProvider clock,
    ILogger<SessionStore> logger) : BaseService(context, logger), ISessionStore
{
    public async Task<string> CreateAsync(
        string subject,
        string accessToken,
        string? refreshToken,
        DateTimeOffset accessTokenExpiresAt,
        DateTimeOffset? refreshTokenExpiresAt,
        CancellationToken ct)
    {
        ArgumentException.ThrowIfNullOrEmpty(subject);
        ArgumentException.ThrowIfNullOrEmpty(accessToken);

        string raw = SessionToken.Generate();
        UserSession session = new()
        {
            TokenHash = SessionToken.Hash(raw),
            Subject = subject,
            AccessToken = accessToken,
            RefreshToken = refreshToken,
            AccessTokenExpiresAt = accessTokenExpiresAt,
            RefreshTokenExpiresAt = refreshTokenExpiresAt,
        };
        Context.UserSessions.Add(session);
        await Context.SaveChangesAsync(ct);
        return raw;
    }

    public async Task<UserSession?> GetValidAsync(string rawToken, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(rawToken))
        {
            return null;
        }

        string hash = SessionToken.Hash(rawToken);
        UserSession? session = await Context.UserSessions.SingleOrDefaultAsync(s => s.TokenHash == hash, ct);
        return session is not null && IsUsable(session, clock.GetUtcNow()) ? session : null;
    }

    public async Task UpdateTokensAsync(
        long sessionId,
        string accessToken,
        string? refreshToken,
        DateTimeOffset accessTokenExpiresAt,
        DateTimeOffset? refreshTokenExpiresAt,
        CancellationToken ct)
    {
        ArgumentException.ThrowIfNullOrEmpty(accessToken);
        UserSession session = await Context.UserSessions.SingleAsync(s => s.Id == sessionId, ct);
        session.AccessToken = accessToken;
        session.RefreshToken = refreshToken ?? session.RefreshToken;
        session.AccessTokenExpiresAt = accessTokenExpiresAt;
        session.RefreshTokenExpiresAt = refreshTokenExpiresAt ?? session.RefreshTokenExpiresAt;
        await Context.SaveChangesAsync(ct);
    }

    public async Task<UserSession?> RevokeAsync(string rawToken, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(rawToken))
        {
            return null;
        }

        string hash = SessionToken.Hash(rawToken);
        UserSession? session = await Context.UserSessions.SingleOrDefaultAsync(s => s.TokenHash == hash, ct);
        if (session is null)
        {
            return null;
        }

        if (!session.IsRevoked)
        {
            session.RevokedAt = clock.GetUtcNow();
            await Context.SaveChangesAsync(ct);
        }

        return session;
    }

    public async Task<int> RevokeAllForSubjectAsync(string subject, CancellationToken ct)
    {
        ArgumentException.ThrowIfNullOrEmpty(subject);
        DateTimeOffset now = clock.GetUtcNow();
        List<UserSession> live = await Context.UserSessions
            .Where(s => s.Subject == subject && s.RevokedAt == null)
            .ToListAsync(ct);
        foreach (UserSession session in live)
        {
            session.RevokedAt = now;
        }

        await Context.SaveChangesAsync(ct);
        return live.Count;
    }

    public async Task<int> PurgeAsync(TimeSpan grace, CancellationToken ct)
    {
        DateTimeOffset cutoff = clock.GetUtcNow() - grace;
        List<UserSession> dead = await Context.UserSessions
            .Where(s =>
                (s.RevokedAt != null && s.RevokedAt < cutoff)
                || (s.RevokedAt == null
                    && s.AccessTokenExpiresAt < cutoff
                    && (s.RefreshTokenExpiresAt == null || s.RefreshTokenExpiresAt < cutoff)))
            .ToListAsync(ct);
        if (dead.Count == 0)
        {
            return 0;
        }

        int count = dead.Count;
        Context.UserSessions.RemoveRange(dead);
        await Context.SaveChangesAsync(ct);
        Log.PurgedSessions(Logger, count);
        return count;
    }

    /// <summary>Live = not revoked and either the access token or the refresh token is still within its lifetime.</summary>
    internal static bool IsUsable(UserSession session, DateTimeOffset now) =>
        !session.IsRevoked
        && (session.AccessTokenExpiresAt > now
            || (session.RefreshToken is not null
                && (session.RefreshTokenExpiresAt is null || session.RefreshTokenExpiresAt > now)));
}

/// <summary>Periodically purges revoked/expired sessions so the table does not grow forever.</summary>
internal sealed class SessionCleanupService(
    IServiceScopeFactory scopeFactory,
    IOptions<SessionStoreOptions> options,
    ILogger<SessionCleanupService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        SessionStoreOptions settings = options.Value;
        using PeriodicTimer timer = new(settings.CleanupInterval);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(settings.PurgeGrace, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex) when (ex is DbUpdateException or InvalidOperationException or TimeoutException)
            {
                Log.CleanupFailed(logger, ex);
            }

            if (!await timer.WaitForNextTickAsync(stoppingToken))
            {
                return;
            }
        }
    }

    internal async Task RunOnceAsync(TimeSpan grace, CancellationToken ct)
    {
        using IServiceScope scope = scopeFactory.CreateScope();
        ISessionStore store = scope.ServiceProvider.GetRequiredService<ISessionStore>();
        await store.PurgeAsync(grace, ct);
    }
}
