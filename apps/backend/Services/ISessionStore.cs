namespace Chess.Backend.Services;

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
