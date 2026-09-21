using System.Net.Http.Json;
using Microsoft.AspNetCore.WebUtilities;
using ZiggyCreatures.Caching.Fusion;

namespace Chess.Backend.Data.Auth;

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
