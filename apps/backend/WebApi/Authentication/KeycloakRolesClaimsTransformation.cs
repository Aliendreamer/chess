using System.Text.Json;
using Microsoft.AspNetCore.Authentication;

namespace Chess.Backend.WebApi.Authentication;

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
