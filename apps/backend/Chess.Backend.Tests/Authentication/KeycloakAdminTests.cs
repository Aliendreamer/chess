using System.Net;
using System.Text.Json;
using Chess.Backend.Extensions;

namespace Chess.Backend.Tests.Authentication;

/// <summary>The realm admin API client (member-admin D3) against a fake Keycloak.</summary>
public sealed class KeycloakAdminTests
{
    private const string Authority = "http://keycloak.chess.localhost/realms/chess";
    private const string Admin = "http://keycloak.chess.localhost/admin/realms/chess/";
    private const string TokenUrl = Authority + "/protocol/openid-connect/token";

    private sealed class Handler(Func<HttpRequestMessage, string, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<(HttpMethod Method, string Url, string Body, string? Auth)> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            string body = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
            Requests.Add((request.Method, request.RequestUri!.ToString(), body, request.Headers.Authorization?.ToString()));
            return respond(request, body);
        }
    }

    private static HttpResponseMessage Json(string json, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };

    /// <summary>The token endpoint answers a 300 s token; everything else goes to <paramref name="api"/>.</summary>
    private static (KeycloakAdminClient Client, Handler Handler, FakeClock Clock) Build(Func<HttpRequestMessage, string, HttpResponseMessage> api)
    {
        Handler handler = new((req, body) => req.RequestUri!.ToString() == TokenUrl
            ? Json("""{"access_token":"svc-token","expires_in":300}""")
            : api(req, body));
        Mock<IHttpClientFactory> factory = new();
        factory.Setup(f => f.CreateClient(Constants.KeycloakHttpClient)).Returns(() => new HttpClient(handler, disposeHandler: false));
        FakeClock clock = new(Time.Utc("2026-10-13T10:00:00Z"));
        KeycloakAdminClient client = new(
            factory.Object,
            Options.Create(new KeycloakOptions { Authority = Authority, ClientId = "chess_api", ClientSecret = "secret" }),
            Options.Create(new KeycloakAdminOptions()),
            clock);
        return (client, handler, clock);
    }

    [Fact]
    public void The_admin_api_lives_beside_the_realm()
    {
        Assert.Equal(new Uri(Admin), KeycloakAdminClient.AdminBase(Authority));
        Assert.Equal(new Uri(Admin), KeycloakAdminClient.AdminBase(Authority + "/"));
        Assert.Throws<KeycloakAdminException>(() => KeycloakAdminClient.AdminBase("http://keycloak/nowhere"));
    }

    [Theory]
    [InlineData("Carol Smith", "Carol", "Smith")]
    [InlineData("  Carol  ", "Carol", "")]
    [InlineData("Anna Maria van Dijk", "Anna", "Maria van Dijk")]
    public void A_full_name_is_split_at_the_first_space(string full, string first, string last) =>
        Assert.Equal((first, last), KeycloakAdminClient.SplitName(full));

    [Fact]
    public async Task Creating_a_user_signs_in_once_and_sends_an_enabled_user_with_a_temporary_password()
    {
        (KeycloakAdminClient client, Handler handler, _) = Build((req, _) =>
        {
            HttpResponseMessage created = new(HttpStatusCode.Created);
            created.Headers.Location = new Uri(Admin + "users/0b9c-new");
            return created;
        });

        string id = await client.CreateUserAsync(new NewKeycloakUser("carol", "Carol Smith", null, "Temp-1234567890ab"), CancellationToken.None);
        await client.CreateUserAsync(new NewKeycloakUser("dave", "Dave", "d@x.org", "Temp-1234567890ab"), CancellationToken.None);

        Assert.Equal("0b9c-new", id);
        Assert.Single(handler.Requests, r => r.Url == TokenUrl); // the token is kept
        Assert.Contains("grant_type=client_credentials", handler.Requests[0].Body, StringComparison.Ordinal);
        (HttpMethod method, string url, string body, string? auth) = handler.Requests[1];
        Assert.Equal((HttpMethod.Post, Admin + "users", "Bearer svc-token"), (method, url, auth));
        using JsonDocument user = JsonDocument.Parse(body);
        Assert.Equal("carol", user.RootElement.GetProperty("username").GetString());
        Assert.Equal(("Carol", "Smith"), (user.RootElement.GetProperty("firstName").GetString(), user.RootElement.GetProperty("lastName").GetString()));
        Assert.False(user.RootElement.TryGetProperty("email", out _));
        Assert.True(user.RootElement.GetProperty("enabled").GetBoolean());
        Assert.Equal("UPDATE_PASSWORD", user.RootElement.GetProperty("requiredActions")[0].GetString());
        JsonElement credential = user.RootElement.GetProperty("credentials")[0];
        Assert.Equal(("password", "Temp-1234567890ab", true), (credential.GetProperty("type").GetString(), credential.GetProperty("value").GetString(), credential.GetProperty("temporary").GetBoolean()));
    }

    [Fact]
    public async Task The_token_is_fetched_again_shortly_before_it_expires()
    {
        (KeycloakAdminClient client, Handler handler, FakeClock clock) = Build((_, _) => new HttpResponseMessage(HttpStatusCode.NoContent));

        await client.SetEnabledAsync("u1", false, CancellationToken.None);
        clock.Advance(TimeSpan.FromSeconds(271)); // 300 s token, 30 s leeway
        await client.SetEnabledAsync("u1", true, CancellationToken.None);

        Assert.Equal(2, handler.Requests.Count(r => r.Url == TokenUrl));
        Assert.Equal(("""{"enabled":true}"""), handler.Requests[^1].Body);
        Assert.Equal((HttpMethod.Put, Admin + "users/u1"), (handler.Requests[^1].Method, handler.Requests[^1].Url));
    }

    [Fact]
    public async Task A_taken_username_is_a_conflict()
    {
        (KeycloakAdminClient client, _, _) = Build((_, _) => Json("""{"errorMessage":"User exists with same username"}""", HttpStatusCode.Conflict));

        KeycloakAdminException e = await Assert.ThrowsAsync<KeycloakAdminException>(
            () => client.CreateUserAsync(new NewKeycloakUser("carol", "Carol", null, "x"), CancellationToken.None));

        Assert.True(e.IsConflict);
    }

    [Fact]
    public async Task Any_other_refusal_or_silence_is_an_admin_exception_with_the_reason()
    {
        (KeycloakAdminClient refusing, _, _) = Build((_, _) => Json("""{"error":"forbidden"}""", HttpStatusCode.Forbidden));
        KeycloakAdminException refused = await Assert.ThrowsAsync<KeycloakAdminException>(() => refusing.ResetPasswordAsync("u1", "p", CancellationToken.None));
        Assert.Contains("403", refused.Message, StringComparison.Ordinal);
        Assert.False(refused.IsConflict);

        (KeycloakAdminClient silent, _, _) = Build((_, _) => throw new HttpRequestException("connection refused"));
        KeycloakAdminException down = await Assert.ThrowsAsync<KeycloakAdminException>(() => silent.SetEnabledAsync("u1", false, CancellationToken.None));
        Assert.Equal("connection refused", down.Message);
    }

    [Fact]
    public async Task Admin_is_granted_and_removed_through_the_realm_roles_representation()
    {
        (KeycloakAdminClient client, Handler handler, _) = Build((req, _) => req.Method == HttpMethod.Get
            ? Json("""{"id":"role-1","name":"Admin","composite":false}""")
            : new HttpResponseMessage(HttpStatusCode.NoContent));

        await client.SetAdminAsync("u1", true, CancellationToken.None);
        await client.SetAdminAsync("u1", false, CancellationToken.None);

        Assert.Equal(
            [(HttpMethod.Get, Admin + "roles/Admin"), (HttpMethod.Post, Admin + "users/u1/role-mappings/realm"), (HttpMethod.Get, Admin + "roles/Admin"), (HttpMethod.Delete, Admin + "users/u1/role-mappings/realm")],
            handler.Requests.Where(r => r.Url != TokenUrl).Select(r => (r.Method, r.Url)));
        Assert.Equal("""[{"id":"role-1","name":"Admin"}]""", handler.Requests[2].Body);
    }

    [Fact]
    public async Task Who_holds_admin_is_read_from_the_role_and_from_the_user()
    {
        (KeycloakAdminClient client, Handler handler, _) = Build((req, _) => req.RequestUri!.AbsolutePath.EndsWith("/users", StringComparison.Ordinal)
            ? Json("""[{"id":"u1","username":"ann"},{"id":"u2","username":"bob"}]""")
            : Json("""[{"id":"r1","name":"User"},{"id":"r2","name":"Admin"}]"""));

        Assert.Equal(new HashSet<string>(["u1", "u2"]), await client.AdminIdsAsync(CancellationToken.None));
        Assert.True(await client.IsAdminAsync("u1", CancellationToken.None));
        Assert.Contains(handler.Requests, r => r.Url == Admin + "roles/Admin/users?first=0&max=1000");
    }

    [Fact]
    public void A_temporary_password_is_sixteen_url_safe_characters_and_never_the_same()
    {
        string one = TemporaryPassword.New();

        Assert.Equal(16, one.Length);
        Assert.Matches("^[A-Za-z0-9_-]{16}$", one);
        Assert.NotEqual(one, TemporaryPassword.New());
    }

    [Fact]
    public void The_options_refuse_nonsense()
    {
        new KeycloakAdminOptions().Validate();
        Assert.Throws<InvalidOperationException>(() => new KeycloakAdminOptions { MaxRoleMembers = 0 }.Validate());
        Assert.Throws<InvalidOperationException>(() => new KeycloakAdminOptions { TokenLeewaySeconds = -1 }.Validate());
    }
}
