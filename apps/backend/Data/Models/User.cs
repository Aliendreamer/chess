namespace Chess.Backend.Data.Models;

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

    /// <summary>Display preferences as JSON (user-preferences); null means the defaults.</summary>
    public string? Preferences { get; set; }

    /// <summary>False once an Admin deactivated the member (club-members D3): no sign-in, not listed, games kept.</summary>
    public bool Active { get; set; } = true;

    /// <summary>When the member's last page closed (club-members D1); null until they first went offline.</summary>
    public DateTimeOffset? LastSeenAt { get; set; }
}
