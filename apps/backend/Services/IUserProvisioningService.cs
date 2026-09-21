namespace Chess.Backend.Services;

internal interface IUserProvisioningService : IService
{
    /// <summary>Returns the local user id for a Keycloak subject, creating the row on first sight.</summary>
    Task<long> EnsureUserAsync(string subject, string? email, string? fullName, CancellationToken ct);
}
