namespace Chess.Backend.Data.Models;

internal abstract class AuditableEntity
{
    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>Monotonic per-row revision, bumped by <see cref="AuditInterceptor"/> on every update.</summary>
    public long Version { get; set; }
}

internal sealed class User : AuditableEntity
{
    public long Id { get; set; }

    /// <summary>Keycloak <c>sub</c> claim; the stable identity of the user.</summary>
    public required string Sub { get; set; }

    public string? Email { get; set; }

    public string? FullName { get; set; }

    /// <summary>
    /// Keycloak <c>preferred_username</c>: the public display name (ROADMAP D23), unique in the realm. Never the email or
    /// full name. Snapshotted onto each game when it is created, so a later change never rewrites past games.
    /// </summary>
    public string? Username { get; set; }
}

/// <summary>
/// A server-owned session. The browser holds only the opaque raw token; this row holds its hash and the IdP
/// tokens, so revoking the row revokes the browser's access regardless of token lifetimes.
/// </summary>
internal sealed class UserSession : AuditableEntity
{
    public long Id { get; set; }

    /// <summary>SHA-256 of the raw cookie token. The raw value is never stored.</summary>
    public required string TokenHash { get; set; }

    public required string Subject { get; set; }

    public required string AccessToken { get; set; }

    public string? RefreshToken { get; set; }

    public DateTimeOffset AccessTokenExpiresAt { get; set; }

    public DateTimeOffset? RefreshTokenExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }

    public bool IsRevoked => RevokedAt is not null;
}
