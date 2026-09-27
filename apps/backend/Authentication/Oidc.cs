using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Chess.Backend.WebApi.Auth;
using Microsoft.AspNetCore.WebUtilities;
using ZiggyCreatures.Caching.Fusion;

namespace Chess.Backend.Authentication;

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

internal interface IKeycloakOidcClient
{
    Task<string> BuildAuthorizeUrlAsync(string state, string codeChallenge, string nonce, CancellationToken ct);

    Task<TokenResponse> ExchangeCodeAsync(string code, string codeVerifier, CancellationToken ct);

    Task<TokenResponse> RefreshAsync(string refreshToken, CancellationToken ct);

    /// <summary>Best-effort back-channel revocation of the refresh token at the IdP.</summary>
    Task RevokeRefreshTokenAsync(string refreshToken, CancellationToken ct);

    Task<string> BuildEndSessionUrlAsync(string? idTokenHint, CancellationToken ct);
}

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

internal sealed class KeycloakOidcClient(
    IHttpClientFactory httpClientFactory,
    IOptions<KeycloakOptions> options,
    IFusionCache cache,
    ILogger<KeycloakOidcClient> logger) : IKeycloakOidcClient
{
    private const string DiscoveryPath = "/.well-known/openid-configuration";
    private static readonly TimeSpan DiscoveryTtl = TimeSpan.FromHours(1);

    private readonly KeycloakOptions _options = options.Value;

    public async Task<string> BuildAuthorizeUrlAsync(string state, string codeChallenge, string nonce, CancellationToken ct)
    {
        OidcDiscoveryDocument doc = await GetDiscoveryAsync(ct);
        Dictionary<string, string?> query = new(StringComparer.Ordinal)
        {
            ["client_id"] = _options.ClientId,
            ["response_type"] = "code",
            ["scope"] = "openid profile email",
            ["redirect_uri"] = _options.CallbackUri,
            ["state"] = state,
            ["nonce"] = nonce,
            ["code_challenge"] = codeChallenge,
            ["code_challenge_method"] = "S256",
        };
        return QueryHelpers.AddQueryString(doc.AuthorizationEndpoint, query);
    }

    public async Task<TokenResponse> ExchangeCodeAsync(string code, string codeVerifier, CancellationToken ct)
    {
        Dictionary<string, string> form = new(StringComparer.Ordinal)
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = _options.CallbackUri,
            ["code_verifier"] = codeVerifier,
        };
        return await PostTokenAsync(form, ct);
    }

    public async Task<TokenResponse> RefreshAsync(string refreshToken, CancellationToken ct)
    {
        Dictionary<string, string> form = new(StringComparer.Ordinal)
        {
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refreshToken,
        };
        return await PostTokenAsync(form, ct);
    }

    public async Task RevokeRefreshTokenAsync(string refreshToken, CancellationToken ct)
    {
        OidcDiscoveryDocument doc = await GetDiscoveryAsync(ct);
        if (string.IsNullOrEmpty(doc.RevocationEndpoint))
        {
            return;
        }

        Dictionary<string, string> form = new(StringComparer.Ordinal)
        {
            ["token"] = refreshToken,
            ["token_type_hint"] = "refresh_token",
        };
        try
        {
            using HttpResponseMessage response = await CreateClient()
                .PostAsync(new Uri(doc.RevocationEndpoint), WithClientCredentials(form), ct);
            if (!response.IsSuccessStatusCode)
            {
                Log.RevocationStatus(logger, (int)response.StatusCode);
            }
        }
        catch (HttpRequestException ex)
        {
            // Local revocation already happened; the IdP copy just lives until it expires.
            Log.RevocationFailed(logger, ex);
        }
    }

    public async Task<string> BuildEndSessionUrlAsync(string? idTokenHint, CancellationToken ct)
    {
        OidcDiscoveryDocument doc = await GetDiscoveryAsync(ct);
        if (string.IsNullOrEmpty(doc.EndSessionEndpoint))
        {
            return _options.PostLogoutRedirectUri;
        }

        Dictionary<string, string?> query = new(StringComparer.Ordinal)
        {
            ["client_id"] = _options.ClientId,
            ["post_logout_redirect_uri"] = _options.PostLogoutRedirectUri,
        };
        if (!string.IsNullOrEmpty(idTokenHint))
        {
            query["id_token_hint"] = idTokenHint;
        }

        return QueryHelpers.AddQueryString(doc.EndSessionEndpoint, query);
    }

    private Task<OidcDiscoveryDocument> GetDiscoveryAsync(CancellationToken ct) =>
        cache.GetOrSetAsync(
            Constants.Cache.OidcDiscovery,
            async (FusionCacheFactoryExecutionContext<OidcDiscoveryDocument> _, CancellationToken token) =>
            {
                Uri url = new(_options.Authority.TrimEnd('/') + DiscoveryPath);
                OidcDiscoveryDocument? doc = await CreateClient().GetFromJsonAsync<OidcDiscoveryDocument>(url, token);
                return doc ?? throw new InvalidOperationException("Empty OIDC discovery document.");
            },
            options => options.SetDuration(DiscoveryTtl),
            ct).AsTask();

    private async Task<TokenResponse> PostTokenAsync(Dictionary<string, string> form, CancellationToken ct)
    {
        OidcDiscoveryDocument doc = await GetDiscoveryAsync(ct);
        using HttpResponseMessage response = await CreateClient()
            .PostAsync(new Uri(doc.TokenEndpoint), WithClientCredentials(form), ct);
        if (!response.IsSuccessStatusCode)
        {
            string body = await response.Content.ReadAsStringAsync(ct);
            Log.TokenEndpointError(logger, (int)response.StatusCode, body);
            throw new HttpRequestException($"Token endpoint returned {(int)response.StatusCode}.", null, response.StatusCode);
        }

        TokenResponse? tokens = await response.Content.ReadFromJsonAsync<TokenResponse>(ct);
        return tokens is { AccessToken.Length: > 0 }
            ? tokens
            : throw new InvalidOperationException("Token endpoint returned no access token.");
    }

    private FormUrlEncodedContent WithClientCredentials(Dictionary<string, string> form)
    {
        form["client_id"] = _options.ClientId;
        form["client_secret"] = _options.ClientSecret;
        return new FormUrlEncodedContent(form);
    }

    private HttpClient CreateClient() => httpClientFactory.CreateClient(Constants.KeycloakHttpClient);
}

internal sealed record PkceValues(string Verifier, string Challenge, string Nonce)
{
    public const char CookieSeparator = '.';

    /// <summary>Serialises to the PKCE cookie payload <c>"&lt;nonce&gt;.&lt;verifier&gt;"</c>.</summary>
    public string ToCookieValue() => string.Concat(Nonce, CookieSeparator, Verifier);

    public static bool TryParseCookieValue(string? value, out string nonce, out string verifier)
    {
        nonce = string.Empty;
        verifier = string.Empty;
        if (string.IsNullOrEmpty(value))
        {
            return false;
        }

        int idx = value.IndexOf(CookieSeparator, StringComparison.Ordinal);
        if (idx <= 0 || idx == value.Length - 1)
        {
            return false;
        }

        nonce = value[..idx];
        verifier = value[(idx + 1)..];
        return true;
    }
}

internal static class Pkce
{
    private const int VerifierBytes = 32;
    private const int NonceBytes = 16;

    /// <summary>RFC 7636 verifier + S256 challenge, plus a nonce that binds the state to the PKCE cookie.</summary>
    public static PkceValues Create()
    {
        string verifier = Base64Url.Encode(RandomNumberGenerator.GetBytes(VerifierBytes));
        string nonce = Base64Url.Encode(RandomNumberGenerator.GetBytes(NonceBytes));
        return new PkceValues(verifier, ComputeChallenge(verifier), nonce);
    }

    public static string ComputeChallenge(string verifier)
    {
        ArgumentException.ThrowIfNullOrEmpty(verifier);
        return Base64Url.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
    }
}

internal static class Base64Url
{
    public static string Encode(ReadOnlySpan<byte> bytes) => System.Buffers.Text.Base64Url.EncodeToString(bytes);

    public static bool TryDecode(string? text, [NotNullWhen(true)] out byte[]? bytes)
    {
        bytes = null;
        if (string.IsNullOrEmpty(text))
        {
            return false;
        }

        try
        {
            bytes = System.Buffers.Text.Base64Url.DecodeFromChars(text);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

/// <summary>What round-trips through the IdP's <c>state</c> parameter.</summary>
internal sealed record OidcState(
    [property: JsonPropertyName("n")] string Nonce,
    [property: JsonPropertyName("r")] string ReturnTo);

internal static class OidcStateCodec
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static string Encode(OidcState state)
    {
        ArgumentNullException.ThrowIfNull(state);
        return Base64Url.Encode(JsonSerializer.SerializeToUtf8Bytes(state, Json));
    }

    public static bool TryDecode(string? encoded, [NotNullWhen(true)] out OidcState? state)
    {
        state = null;
        if (!Base64Url.TryDecode(encoded, out byte[]? bytes))
        {
            return false;
        }

        try
        {
            state = JsonSerializer.Deserialize<OidcState>(bytes, Json);
        }
        catch (JsonException)
        {
            return false;
        }

        if (state is not { Nonce.Length: > 0, ReturnTo: not null })
        {
            state = null;
            return false;
        }

        return true;
    }
}

/// <summary>
/// Keeps <c>returnTo</c> a relative in-app path so the callback can never become an open redirect.
/// </summary>
internal static class ReturnToSanitizer
{
    public const string Default = "/";
    private const int MaxLength = 2048;

    public static string Sanitize(string? returnTo)
    {
        if (string.IsNullOrWhiteSpace(returnTo) || returnTo.Length > MaxLength)
        {
            return Default;
        }

        // Must be an absolute-path reference: exactly one leading '/', no scheme, no authority.
        if (returnTo[0] != '/' || (returnTo.Length > 1 && (returnTo[1] == '/' || returnTo[1] == '\\')))
        {
            return Default;
        }

        if (returnTo.Contains("://", StringComparison.Ordinal) || returnTo.Contains('\\', StringComparison.Ordinal))
        {
            return Default;
        }

        foreach (char c in returnTo)
        {
            if (char.IsControl(c) || char.IsWhiteSpace(c))
            {
                return Default;
            }
        }

        return returnTo;
    }
}

/// <summary>
/// Reads <c>sub</c> straight from a JWT payload, without validation — the token was just issued to us by the IdP
/// over the back channel, and JwtBearer validates it on every subsequent request anyway.
/// </summary>
internal static class JwtSubjectReader
{
    public static bool TryReadSubject(string? jwt, [NotNullWhen(true)] out string? subject)
    {
        subject = null;
        if (string.IsNullOrEmpty(jwt))
        {
            return false;
        }

        string[] parts = jwt.Split('.');
        if (parts.Length < 2 || !Base64Url.TryDecode(parts[1], out byte[]? payload))
        {
            return false;
        }

        try
        {
            using JsonDocument doc = JsonDocument.Parse(payload);
            if (doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty(Constants.Claims.Subject, out JsonElement sub)
                && sub.ValueKind == JsonValueKind.String)
            {
                subject = sub.GetString();
                return !string.IsNullOrEmpty(subject);
            }
        }
        catch (JsonException)
        {
            return false;
        }

        return false;
    }
}

internal sealed record CallbackOutcome(string Code, string Verifier, string ReturnTo, string? Error)
{
    public static CallbackOutcome Fail(string error) => new(string.Empty, string.Empty, ReturnToSanitizer.Default, error);
}

/// <summary>Pure validation of the callback inputs, kept out of the endpoint so it is unit-testable.</summary>
internal static class CallbackValidator
{
    public static CallbackOutcome Validate(CallbackRequest request, string? pkceCookie)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (!string.IsNullOrEmpty(request.Error))
        {
            return CallbackOutcome.Fail($"IdP returned error '{request.Error}'.");
        }

        if (string.IsNullOrEmpty(request.Code))
        {
            return CallbackOutcome.Fail("Missing authorization code.");
        }

        if (!PkceValues.TryParseCookieValue(pkceCookie, out string cookieNonce, out string verifier))
        {
            return CallbackOutcome.Fail("Missing or malformed PKCE cookie.");
        }

        if (!OidcStateCodec.TryDecode(request.State, out OidcState? state))
        {
            return CallbackOutcome.Fail("Malformed state.");
        }

        if (!string.Equals(state.Nonce, cookieNonce, StringComparison.Ordinal))
        {
            return CallbackOutcome.Fail("State does not match this browser's login attempt.");
        }

        return new CallbackOutcome(request.Code, verifier, ReturnToSanitizer.Sanitize(state.ReturnTo), null);
    }
}
