using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json.Serialization;
using Chess.Backend.Extensions;

namespace Chess.Backend.Authentication;

/// <summary>
/// Section <c>KeycloakAdmin</c> (member-admin D3): tuning of the admin API client. Where it talks to and as whom comes
/// from <see cref="KeycloakOptions"/> (the realm's issuer, and the <c>chess_api</c> client's service account).
/// </summary>
internal sealed class KeycloakAdminOptions : ISettings
{
    public const string SectionName = "KeycloakAdmin";

    /// <summary>The service token is fetched again this long before it expires.</summary>
    public int TokenLeewaySeconds { get; set; } = 30;

    /// <summary>The most Admin role holders read in one call.</summary>
    public int MaxRoleMembers { get; set; } = 1000;

    public void Validate()
    {
        if (TokenLeewaySeconds < 0 || MaxRoleMembers <= 0)
        {
            throw new InvalidOperationException("KeycloakAdmin:TokenLeewaySeconds must not be negative and KeycloakAdmin:MaxRoleMembers must be positive.");
        }
    }
}

/// <summary>Keycloak refused or did not answer an admin call; the message is safe to show an Admin.</summary>
internal sealed class KeycloakAdminException : Exception
{
    public KeycloakAdminException()
    {
    }

    public KeycloakAdminException(string message)
        : base(message)
    {
    }

    public KeycloakAdminException(string message, Exception inner)
        : base(message, inner)
    {
    }

    public KeycloakAdminException(string message, HttpStatusCode status)
        : base(message) => Status = status;

    /// <summary>Keycloak's status, when it answered at all.</summary>
    public HttpStatusCode? Status { get; }

    public bool IsConflict => Status == HttpStatusCode.Conflict;
}

/// <summary>A new Keycloak user: enabled, with a temporary password that must be changed at first sign-in.</summary>
internal sealed record NewKeycloakUser(string Username, string FullName, string? Email, string TemporaryPassword);

/// <summary>
/// The realm's admin REST API, as the <c>chess_api</c> service account (granted <c>manage-users</c>, <c>view-users</c>,
/// <c>query-users</c> and <c>view-realm</c> by <c>keycloak-init</c>). Every user id is Keycloak's, which is the
/// <c>sub</c> of that user's tokens. Every failure is a <see cref="KeycloakAdminException"/>.
/// </summary>
internal interface IKeycloakAdmin
{
    /// <summary>Creates the user and returns its id; a taken username is a conflict.</summary>
    Task<string> CreateUserAsync(NewKeycloakUser user, CancellationToken ct);

    Task SetEnabledAsync(string userId, bool enabled, CancellationToken ct);

    /// <summary>Sets a temporary password: the user must choose their own at the next sign-in.</summary>
    Task ResetPasswordAsync(string userId, string temporaryPassword, CancellationToken ct);

    Task SetAdminAsync(string userId, bool admin, CancellationToken ct);

    Task<bool> IsAdminAsync(string userId, CancellationToken ct);

    /// <summary>The ids of every user holding the realm role <c>Admin</c>.</summary>
    Task<IReadOnlySet<string>> AdminIdsAsync(CancellationToken ct);
}

internal sealed class KeycloakAdminClient(
    IHttpClientFactory httpClientFactory,
    IOptions<KeycloakOptions> keycloak,
    IOptions<KeycloakAdminOptions> admin,
    TimeProvider clock) : IKeycloakAdmin, IDisposable
{
    private readonly KeycloakOptions _keycloak = keycloak.Value;
    private readonly KeycloakAdminOptions _admin = admin.Value;
    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private string? _token;
    private DateTimeOffset _tokenExpires;

    public void Dispose() => _tokenLock.Dispose();

    /// <summary><c>http://host/realms/chess</c> → <c>http://host/admin/realms/chess</c>.</summary>
    public static Uri AdminBase(string authority)
    {
        ArgumentException.ThrowIfNullOrEmpty(authority);
        string trimmed = authority.TrimEnd('/');
        int realms = trimmed.LastIndexOf("/realms/", StringComparison.Ordinal);
        if (realms < 0)
        {
            throw new KeycloakAdminException("Keycloak:Authority does not name a realm.");
        }

        return new Uri(trimmed[..realms] + "/admin" + trimmed[realms..] + "/");
    }

    /// <summary>First name = the first word, last name = the rest (Keycloak keeps them apart).</summary>
    public static (string First, string Last) SplitName(string fullName)
    {
        string name = (fullName ?? string.Empty).Trim();
        int space = name.IndexOf(' ', StringComparison.Ordinal);
        return space < 0 ? (name, string.Empty) : (name[..space], name[(space + 1)..].Trim());
    }

    public async Task<string> CreateUserAsync(NewKeycloakUser user, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(user);
        (string first, string last) = SplitName(user.FullName);
        UserRepresentation body = new()
        {
            Username = user.Username,
            FirstName = first,
            LastName = last,
            Email = string.IsNullOrWhiteSpace(user.Email) ? null : user.Email,
            Enabled = true,
            RequiredActions = ["UPDATE_PASSWORD"],
            Credentials = [new CredentialRepresentation { Value = user.TemporaryPassword }],
        };
        using HttpResponseMessage response = await SendAsync(HttpMethod.Post, "users", body, ct);
        if (response.StatusCode == HttpStatusCode.Conflict)
        {
            throw new KeycloakAdminException("That username is taken.", HttpStatusCode.Conflict);
        }

        await EnsureSuccessAsync(response, "create the user", ct);
        string? location = response.Headers.Location?.ToString();
        string id = location is null ? string.Empty : location.TrimEnd('/')[(location.TrimEnd('/').LastIndexOf('/') + 1)..];
        return id.Length > 0 ? id : throw new KeycloakAdminException("Keycloak created the user but did not say its id.");
    }

    public async Task SetEnabledAsync(string userId, bool enabled, CancellationToken ct)
    {
        using HttpResponseMessage response = await SendAsync(HttpMethod.Put, $"users/{Escape(userId)}", new UserRepresentation { Enabled = enabled }, ct);
        await EnsureSuccessAsync(response, enabled ? "enable the user" : "disable the user", ct);
    }

    public async Task ResetPasswordAsync(string userId, string temporaryPassword, CancellationToken ct)
    {
        using HttpResponseMessage response = await SendAsync(
            HttpMethod.Put, $"users/{Escape(userId)}/reset-password", new CredentialRepresentation { Value = temporaryPassword }, ct);
        await EnsureSuccessAsync(response, "reset the password", ct);
    }

    public async Task SetAdminAsync(string userId, bool admin, CancellationToken ct)
    {
        RoleRepresentation role = await GetAsync<RoleRepresentation>($"roles/{Escape(Constants.Roles.Admin)}", "read the Admin role", ct);
        using HttpResponseMessage response = await SendAsync(admin ? HttpMethod.Post : HttpMethod.Delete, $"users/{Escape(userId)}/role-mappings/realm", new[] { role }, ct);
        await EnsureSuccessAsync(response, admin ? "grant Admin" : "remove Admin", ct);
    }

    public async Task<bool> IsAdminAsync(string userId, CancellationToken ct)
    {
        RoleRepresentation[] roles = await GetAsync<RoleRepresentation[]>($"users/{Escape(userId)}/role-mappings/realm", "read the user's roles", ct);
        return roles.Any(r => r.Name == Constants.Roles.Admin);
    }

    public async Task<IReadOnlySet<string>> AdminIdsAsync(CancellationToken ct)
    {
        string max = _admin.MaxRoleMembers.ToString(CultureInfo.InvariantCulture);
        UserRepresentation[] users = await GetAsync<UserRepresentation[]>(
            $"roles/{Escape(Constants.Roles.Admin)}/users?first=0&max={max}", "read who holds Admin", ct);
        return users.Select(u => u.Id).OfType<string>().ToHashSet(StringComparer.Ordinal);
    }

    private static string Escape(string segment) => Uri.EscapeDataString(segment);

    private async Task<T> GetAsync<T>(string path, string what, CancellationToken ct)
    {
        using HttpResponseMessage response = await SendAsync(HttpMethod.Get, path, null, ct);
        await EnsureSuccessAsync(response, what, ct);
        try
        {
            return await response.Content.ReadFromJsonAsync<T>(ct)
                ?? throw new KeycloakAdminException($"Keycloak sent nothing when asked to {what}.");
        }
        catch (System.Text.Json.JsonException e)
        {
            throw new KeycloakAdminException($"Keycloak's answer to {what} was not understood.", e);
        }
    }

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, object? body, CancellationToken ct)
    {
        string token = await TokenAsync(ct);
        using HttpRequestMessage request = new(method, new Uri(AdminBase(_keycloak.Authority), path));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null)
        {
            request.Content = JsonContent.Create(body, body.GetType());
        }

        try
        {
            return await Client().SendAsync(request, ct);
        }
        catch (HttpRequestException e)
        {
            throw new KeycloakAdminException(e.Message, e);
        }
        catch (TaskCanceledException e) when (!ct.IsCancellationRequested)
        {
            throw new KeycloakAdminException("Keycloak timed out.", e);
        }
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, string what, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        string detail = await response.Content.ReadAsStringAsync(ct);
        detail = detail.Length > 200 ? detail[..200] : detail;
        throw new KeycloakAdminException(
            $"could not {what} ({(int)response.StatusCode}{(detail.Length > 0 ? ": " + detail : string.Empty)}).", response.StatusCode);
    }

    /// <summary>The service account's token (client credentials), kept until <see cref="KeycloakAdminOptions.TokenLeewaySeconds"/> before it expires.</summary>
    private async Task<string> TokenAsync(CancellationToken ct)
    {
        await _tokenLock.WaitAsync(ct);
        try
        {
            DateTimeOffset now = clock.GetUtcNow();
            if (_token is not null && now < _tokenExpires)
            {
                return _token;
            }

            using FormUrlEncodedContent form = new(new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["grant_type"] = "client_credentials",
                ["client_id"] = _keycloak.ClientId,
                ["client_secret"] = _keycloak.ClientSecret,
            });
            Uri tokenUrl = new(_keycloak.Authority.TrimEnd('/') + "/protocol/openid-connect/token");
            HttpResponseMessage response;
            try
            {
                response = await Client().PostAsync(tokenUrl, form, ct);
            }
            catch (HttpRequestException e)
            {
                throw new KeycloakAdminException(e.Message, e);
            }
            catch (TaskCanceledException e) when (!ct.IsCancellationRequested)
            {
                throw new KeycloakAdminException("Keycloak timed out.", e);
            }

            using (response)
            {
                await EnsureSuccessAsync(response, "sign the API in", ct);
                ServiceToken? token = await response.Content.ReadFromJsonAsync<ServiceToken>(ct);
                if (token is not { AccessToken.Length: > 0 })
                {
                    throw new KeycloakAdminException("Keycloak sent no service token.");
                }

                _token = token.AccessToken;
                _tokenExpires = now + TimeSpan.FromSeconds(Math.Max(0, token.ExpiresIn - _admin.TokenLeewaySeconds));
                return _token;
            }
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    private HttpClient Client() => httpClientFactory.CreateClient(Constants.KeycloakHttpClient);

    private sealed record ServiceToken(
        [property: JsonPropertyName("access_token")] string AccessToken,
        [property: JsonPropertyName("expires_in")] int ExpiresIn);

    private sealed class UserRepresentation
    {
        [JsonPropertyName("id")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Id { get; init; }

        [JsonPropertyName("username")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Username { get; init; }

        [JsonPropertyName("firstName")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? FirstName { get; init; }

        [JsonPropertyName("lastName")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? LastName { get; init; }

        [JsonPropertyName("email")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Email { get; init; }

        [JsonPropertyName("enabled")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public bool? Enabled { get; init; }

        [JsonPropertyName("requiredActions")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public IReadOnlyList<string>? RequiredActions { get; init; }

        [JsonPropertyName("credentials")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public IReadOnlyList<CredentialRepresentation>? Credentials { get; init; }
    }

    private sealed class CredentialRepresentation
    {
        [JsonPropertyName("type")]
        public string Type { get; init; } = "password";

        [JsonPropertyName("value")]
        public required string Value { get; init; }

        [JsonPropertyName("temporary")]
        public bool Temporary { get; init; } = true;
    }

    private sealed record RoleRepresentation(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("name")] string Name);
}

/// <summary>Temporary passwords (member-admin D3): 16 characters from a URL-safe alphabet, never logged or stored.</summary>
internal static class TemporaryPassword
{
    public const int Length = 16;

    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_";

    public static string New() => RandomNumberGenerator.GetString(Alphabet, Length);
}
