namespace Chess.Backend.Data.ReadModels;

/// <summary>
/// The public part of a <c>users</c> row, read from the replica (player-profiles): never the email, full name or
/// preferences. Not an rm_* table — the replica is a full copy of the primary — and never written through this type.
/// </summary>
internal sealed class PlayerIdentity
{
    public long Id { get; set; }

    /// <summary>Keycloak <c>preferred_username</c> (D23); null until the user's first login filled it.</summary>
    public string? Username { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
