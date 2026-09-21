namespace Chess.Backend.Data.Models;

internal sealed class User : AuditableEntity
{
    public long Id { get; set; }

    /// <summary>Keycloak <c>sub</c> claim; the stable identity of the user.</summary>
    public required string Sub { get; set; }

    public string? Email { get; set; }

    public string? FullName { get; set; }
}
