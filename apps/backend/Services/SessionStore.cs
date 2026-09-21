namespace Chess.Backend.Services;

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
