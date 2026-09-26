using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using ZiggyCreatures.Caching.Fusion;

namespace Chess.Backend.Tests.Auth;

public sealed class KeycloakOidcClientTests
{
    private const string Authority = "http://keycloak.chess.localhost/realms/chess";
    private static readonly string Discovery = JsonSerializer.Serialize(new
    {
        issuer = Authority,
        authorization_endpoint = Authority + "/protocol/openid-connect/auth",
        token_endpoint = Authority + "/protocol/openid-connect/token",
        end_session_endpoint = Authority + "/protocol/openid-connect/logout",
        revocation_endpoint = Authority + "/protocol/openid-connect/revoke",
    });

    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, string Body)> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            string body = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
            Requests.Add((request, body));
            return await respond(request);
        }
    }

    private static HttpResponseMessage Json(string json, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };

    /// <summary>Serves <see cref="Discovery"/> and answers every other request with <paramref name="endpoint"/>.</summary>
    private static Func<HttpRequestMessage, Task<HttpResponseMessage>> WithDiscovery(Func<HttpRequestMessage, HttpResponseMessage> endpoint) =>
        req => Task.FromResult(req.RequestUri!.AbsolutePath.EndsWith("openid-configuration", StringComparison.Ordinal) ? Json(Discovery) : endpoint(req));

    private static (KeycloakOidcClient Client, Handler Handler) Build(Func<HttpRequestMessage, Task<HttpResponseMessage>>? respond = null)
    {
        Handler handler = new(respond ?? WithDiscovery(_ => Json("""{"access_token":"at","refresh_token":"rt","expires_in":300,"refresh_expires_in":1800}""")));
        Mock<IHttpClientFactory> factory = new();
        factory.Setup(f => f.CreateClient(Constants.KeycloakHttpClient)).Returns(() => new HttpClient(handler, disposeHandler: false));
        KeycloakOptions options = new()
        {
            Authority = Authority,
            ClientId = "chess_api",
            ClientSecret = "secret",
            CallbackUri = "http://app.chess.localhost/api/auth/callback",
            PostLogoutRedirectUri = "http://app.chess.localhost",
        };
        KeycloakOidcClient client = new(factory.Object, Options.Create(options), new FusionCache(new FusionCacheOptions()), NullLogger<KeycloakOidcClient>.Instance);
        return (client, handler);
    }

    [Fact]
    public async Task Authorize_url_carries_pkce_state_and_client()
    {
        (KeycloakOidcClient client, Handler handler) = Build();

        string url = await client.BuildAuthorizeUrlAsync("st", "ch", "no", CancellationToken.None);
        await client.BuildAuthorizeUrlAsync("st2", "ch", "no", CancellationToken.None);

        Uri uri = new(url);
        Dictionary<string, Microsoft.Extensions.Primitives.StringValues> q = QueryHelpers.ParseQuery(uri.Query);
        Assert.Equal("/realms/chess/protocol/openid-connect/auth", uri.AbsolutePath);
        Assert.Equal("code", q["response_type"]);
        Assert.Equal("chess_api", q["client_id"]);
        Assert.Equal("st", q["state"]);
        Assert.Equal("ch", q["code_challenge"]);
        Assert.Equal("S256", q["code_challenge_method"]);
        Assert.Equal("no", q["nonce"]);
        Assert.Equal("http://app.chess.localhost/api/auth/callback", q["redirect_uri"]);
        Assert.Single(handler.Requests); // discovery fetched once, then cached
    }

    [Fact]
    public async Task Exchange_posts_code_grant_with_verifier_and_client_secret()
    {
        (KeycloakOidcClient client, Handler handler) = Build();

        TokenResponse tokens = await client.ExchangeCodeAsync("the-code", "the-verifier", CancellationToken.None);

        Assert.Equal("at", tokens.AccessToken);
        Assert.Equal("rt", tokens.RefreshToken);
        Assert.Equal(300, tokens.ExpiresIn);
        Assert.Equal(1800, tokens.RefreshExpiresIn);
        (HttpRequestMessage req, string body) = handler.Requests[^1];
        Assert.Equal(HttpMethod.Post, req.Method);
        Assert.EndsWith("/token", req.RequestUri!.AbsolutePath, StringComparison.Ordinal);
        Assert.Contains("grant_type=authorization_code", body, StringComparison.Ordinal);
        Assert.Contains("code=the-code", body, StringComparison.Ordinal);
        Assert.Contains("code_verifier=the-verifier", body, StringComparison.Ordinal);
        Assert.Contains("client_secret=secret", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Refresh_posts_refresh_grant()
    {
        (KeycloakOidcClient client, Handler handler) = Build();
        await client.RefreshAsync("old-rt", CancellationToken.None);
        Assert.Contains("grant_type=refresh_token", handler.Requests[^1].Body, StringComparison.Ordinal);
        Assert.Contains("refresh_token=old-rt", handler.Requests[^1].Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Token_endpoint_failure_throws_http_request_exception()
    {
        (KeycloakOidcClient client, _) = Build(WithDiscovery(_ => Json("""{"error":"invalid_grant"}""", HttpStatusCode.BadRequest)));
        HttpRequestException ex = await Assert.ThrowsAsync<HttpRequestException>(() => client.RefreshAsync("rt", CancellationToken.None));
        Assert.Equal(HttpStatusCode.BadRequest, ex.StatusCode);
    }

    [Fact]
    public async Task Empty_access_token_is_an_error()
    {
        (KeycloakOidcClient client, _) = Build(WithDiscovery(_ => Json("""{"access_token":"","expires_in":1}""")));
        await Assert.ThrowsAsync<InvalidOperationException>(() => client.ExchangeCodeAsync("c", "v", CancellationToken.None));
    }

    [Fact]
    public async Task End_session_url_uses_client_id_and_post_logout_uri()
    {
        (KeycloakOidcClient client, _) = Build();
        Uri uri = new(await client.BuildEndSessionUrlAsync(null, CancellationToken.None));
        Dictionary<string, Microsoft.Extensions.Primitives.StringValues> q = QueryHelpers.ParseQuery(uri.Query);
        Assert.EndsWith("/logout", uri.AbsolutePath, StringComparison.Ordinal);
        Assert.Equal("chess_api", q["client_id"]);
        Assert.Equal("http://app.chess.localhost", q["post_logout_redirect_uri"]);
        Assert.False(q.ContainsKey("id_token_hint"));

        Uri withHint = new(await client.BuildEndSessionUrlAsync("idt", CancellationToken.None));
        Assert.Equal("idt", QueryHelpers.ParseQuery(withHint.Query)["id_token_hint"]);
    }

    [Fact]
    public async Task End_session_falls_back_to_post_logout_uri_without_endpoint()
    {
        string noLogout = JsonSerializer.Serialize(new { issuer = Authority, authorization_endpoint = "a", token_endpoint = "t" });
        (KeycloakOidcClient client, _) = Build(_ => Task.FromResult(Json(noLogout)));
        Assert.Equal("http://app.chess.localhost", await client.BuildEndSessionUrlAsync(null, CancellationToken.None));
        await client.RevokeRefreshTokenAsync("rt", CancellationToken.None); // no revocation endpoint → no-op
    }

    [Fact]
    public async Task Revocation_is_best_effort()
    {
        (KeycloakOidcClient ok, Handler handler) = Build(WithDiscovery(_ => new HttpResponseMessage(HttpStatusCode.OK)));
        await ok.RevokeRefreshTokenAsync("rt", CancellationToken.None);
        Assert.Contains("token=rt", handler.Requests[^1].Body, StringComparison.Ordinal);
        Assert.Contains("token_type_hint=refresh_token", handler.Requests[^1].Body, StringComparison.Ordinal);

        (KeycloakOidcClient failing, _) = Build(WithDiscovery(_ => new HttpResponseMessage(HttpStatusCode.InternalServerError)));
        await failing.RevokeRefreshTokenAsync("rt", CancellationToken.None);

        (KeycloakOidcClient throwing, _) = Build(WithDiscovery(_ => throw new HttpRequestException("down")));
        await throwing.RevokeRefreshTokenAsync("rt", CancellationToken.None);
    }

    [Fact]
    public async Task Empty_discovery_document_is_an_error()
    {
        (KeycloakOidcClient client, _) = Build(_ => Task.FromResult(Json("null")));
        await Assert.ThrowsAsync<InvalidOperationException>(() => client.BuildAuthorizeUrlAsync("s", "c", "n", CancellationToken.None));
    }
}
