namespace Chess.Backend.WebApi.Auth;

internal sealed class KeycloakOptions
{
    public const string SectionName = "Keycloak";

    /// <summary>Realm issuer, e.g. <c>http://keycloak.chess.localhost/realms/chess</c>. Discovery is derived from it.</summary>
    public string Authority { get; set; } = string.Empty;

    /// <summary>Optional. When empty, audience validation is disabled.</summary>
    public string Audience { get; set; } = string.Empty;

    public string ClientId { get; set; } = string.Empty;

    public string ClientSecret { get; set; } = string.Empty;

    /// <summary>Absolute redirect URI registered on the realm client.</summary>
    public string CallbackUri { get; set; } = string.Empty;

    public string PostLogoutRedirectUri { get; set; } = string.Empty;

    /// <summary>Absolute app origin; the callback redirects to <c>{AppBaseUrl}{returnTo}</c>.</summary>
    public string AppBaseUrl { get; set; } = string.Empty;
}
