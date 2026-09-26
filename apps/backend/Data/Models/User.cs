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
}
