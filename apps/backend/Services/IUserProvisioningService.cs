namespace Chess.Backend.Services;

internal interface IUserProvisioningService : IService
{
    /// <summary>
    /// Returns the local user id for a Keycloak subject, creating the row on first sight. A missing
    /// <paramref name="username"/> is backfilled on a later call; a stored one is never erased or rewritten.
    /// </summary>
    Task<long> EnsureUserAsync(string subject, string? email, string? fullName, string? username, CancellationToken ct);
}
