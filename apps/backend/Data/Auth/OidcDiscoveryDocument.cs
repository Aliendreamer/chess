using System.Text.Json.Serialization;

namespace Chess.Backend.Data.Auth;

internal sealed record OidcDiscoveryDocument(
    [property: JsonPropertyName("issuer")] string Issuer,
    [property: JsonPropertyName("authorization_endpoint")] string AuthorizationEndpoint,
    [property: JsonPropertyName("token_endpoint")] string TokenEndpoint,
    [property: JsonPropertyName("end_session_endpoint")] string? EndSessionEndpoint,
    [property: JsonPropertyName("revocation_endpoint")] string? RevocationEndpoint);

internal sealed record TokenResponse(
    [property: JsonPropertyName("access_token")] string AccessToken,
    [property: JsonPropertyName("refresh_token")] string? RefreshToken,
    [property: JsonPropertyName("expires_in")] int ExpiresIn,
    [property: JsonPropertyName("refresh_expires_in")] int? RefreshExpiresIn,
    [property: JsonPropertyName("id_token")] string? IdToken);
