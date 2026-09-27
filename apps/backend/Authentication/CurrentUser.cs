using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using ZiggyCreatures.Caching.Fusion;

namespace Chess.Backend.Authentication;

internal interface ICurrentUser
{
    bool IsAuthenticated { get; }

    long? Id { get; }

    string? Subject { get; }

    string? Email { get; }

    string? FullName { get; }

    /// <summary>Keycloak <c>preferred_username</c>: the display name (D23).</summary>
    string? Username { get; }

    IReadOnlyList<string> Roles { get; }

    bool IsInRole(string role);
}

/// <summary>Per-request identity, populated by <see cref="UserProvisioningPreProcessor"/>.</summary>
internal sealed class CurrentUser : ICurrentUser
{
    public bool IsAuthenticated => Subject is not null;

    public long? Id { get; private set; }

    public string? Subject { get; private set; }

    public string? Email { get; private set; }

    public string? FullName { get; private set; }

    public string? Username { get; private set; }

    public IReadOnlyList<string> Roles { get; private set; } = [];

    public bool IsInRole(string role) => Roles.Contains(role, StringComparer.Ordinal);

    public void Populate(long id, string subject, string? email, string? fullName, string? username, IReadOnlyList<string> roles)
    {
        ArgumentException.ThrowIfNullOrEmpty(subject);
        Id = id;
        Subject = subject;
        Email = email;
        FullName = fullName;
        Username = username;
        Roles = roles;
    }
}

/// <summary>
/// Global pre-processor: for authenticated requests, JIT-provisions the local user row by <c>sub</c> and fills
/// the scoped <see cref="ICurrentUser"/>. Anonymous requests pass through untouched.
/// </summary>
internal sealed class UserProvisioningPreProcessor : IGlobalPreProcessor
{
    public async Task PreProcessAsync(IPreProcessorContext context, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(context);
        HttpContext http = context.HttpContext;
        ClaimsPrincipal principal = http.User;
        if (principal.Identity?.IsAuthenticated != true)
        {
            return;
        }

        string? subject = principal.FindFirstValue(Constants.Claims.Subject)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(subject))
        {
            return;
        }

        string? email = principal.FindFirstValue(Constants.Claims.Email) ?? principal.FindFirstValue(ClaimTypes.Email);
        string? fullName = principal.FindFirstValue(Constants.Claims.Name)
            ?? principal.FindFirstValue(Constants.Claims.PreferredUsername);
        List<string> roles = principal.FindAll(ClaimTypes.Role).Select(c => c.Value).Distinct(StringComparer.Ordinal).ToList();

        IUserProvisioningService provisioning = http.RequestServices.GetRequiredService<IUserProvisioningService>();
        string? username = principal.FindFirstValue(Constants.Claims.PreferredUsername);
        long id = await provisioning.EnsureUserAsync(subject, email, fullName, username, ct);

        if (http.RequestServices.GetRequiredService<ICurrentUser>() is CurrentUser current)
        {
            current.Populate(id, subject, email, fullName, username, roles);
        }
    }
}

/// <summary>
/// Flattens Keycloak's <c>realm_access.roles</c> JSON claim into standard role claims so <c>[Authorize(Roles)]</c>
/// and <see cref="ClaimsPrincipal.IsInRole"/> work. Idempotent: transformation can run more than once per request.
/// </summary>
internal sealed class KeycloakRolesClaimsTransformation : IClaimsTransformation
{
    private const string TransformedMarker = "chess:roles-transformed";

    public Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
    {
        ArgumentNullException.ThrowIfNull(principal);
        if (principal.Identity is not ClaimsIdentity identity || identity.HasClaim(c => c.Type == TransformedMarker))
        {
            return Task.FromResult(principal);
        }

        foreach (string role in ExtractRealmRoles(principal))
        {
            if (!identity.HasClaim(ClaimTypes.Role, role))
            {
                identity.AddClaim(new Claim(ClaimTypes.Role, role));
            }
        }

        identity.AddClaim(new Claim(TransformedMarker, "1"));
        return Task.FromResult(principal);
    }

    internal static IReadOnlyList<string> ExtractRealmRoles(ClaimsPrincipal principal)
    {
        string? realmAccess = principal.FindFirst(Constants.Claims.RealmAccess)?.Value;
        if (string.IsNullOrEmpty(realmAccess))
        {
            return [];
        }

        try
        {
            using JsonDocument doc = JsonDocument.Parse(realmAccess);
            if (doc.RootElement.ValueKind != JsonValueKind.Object
                || !doc.RootElement.TryGetProperty("roles", out JsonElement roles)
                || roles.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            List<string> result = [];
            foreach (JsonElement role in roles.EnumerateArray())
            {
                if (role.ValueKind == JsonValueKind.String && role.GetString() is { Length: > 0 } value)
                {
                    result.Add(value);
                }
            }

            return result;
        }
        catch (JsonException)
        {
            return [];
        }
    }
}

internal interface IUserProvisioningService : IService
{
    /// <summary>
    /// Returns the local user id for a Keycloak subject, creating the row on first sight. A missing
    /// <paramref name="username"/> is backfilled on a later call; a stored one is never erased or rewritten.
    /// </summary>
    Task<long> EnsureUserAsync(string subject, string? email, string? fullName, string? username, CancellationToken ct);
}

internal sealed class UserProvisioningService(
    ProjectDbContext context,
    IFusionCache cache,
    ILogger<UserProvisioningService> logger) : BaseService(context, logger), IUserProvisioningService
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(10);

    public async Task<long> EnsureUserAsync(string subject, string? email, string? fullName, string? username, CancellationToken ct)
    {
        ArgumentException.ThrowIfNullOrEmpty(subject);
        return await cache.GetOrSetAsync(
            Constants.Cache.UserIdBySubject + subject,
            async (FusionCacheFactoryExecutionContext<long> _, CancellationToken token) =>
                await UpsertAsync(subject, email, fullName, username, token),
            options => options.SetDuration(CacheTtl),
            ct);
    }

    private async Task<long> UpsertAsync(string subject, string? email, string? fullName, string? username, CancellationToken ct)
    {
        User? existing = await Context.Users.SingleOrDefaultAsync(u => u.Sub == subject, ct);
        if (existing is not null)
        {
            if (existing.Username is null && !string.IsNullOrEmpty(username))
            {
                existing.Username = username; // users created before D23 get their name on their next login
                await Context.SaveChangesAsync(ct);
            }

            return existing.Id;
        }

        User user = new() { Sub = subject, Email = email, FullName = fullName, Username = NullIfEmpty(username) };
        Context.Users.Add(user);
        try
        {
            await Context.SaveChangesAsync(ct);
            long id = user.Id;
            Log.ProvisionedUser(Logger, id, subject);
            return id;
        }
        catch (DbUpdateException)
        {
            // Lost the race with a concurrent first request for the same subject: the unique index on Sub
            // rejected our insert, so the other row is the user.
            Context.Entry(user).State = EntityState.Detached;
            User winner = await Context.Users.AsNoTracking().SingleAsync(u => u.Sub == subject, ct);
            return winner.Id;
        }
    }

    private static string? NullIfEmpty(string? value) => string.IsNullOrEmpty(value) ? null : value;
}
