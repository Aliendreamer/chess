namespace Chess.Backend.Data.Models;

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
