namespace Chess.Backend.WebApi.Auth;

/// <summary>Writes and clears the two auth cookies with one consistent policy.</summary>
internal sealed class SessionCookies(
    IOptions<SessionCookieOptions> cookieOptions,
    IOptions<SessionStoreOptions> storeOptions,
    IHostEnvironment environment)
{
    private readonly SessionCookieOptions _cookies = cookieOptions.Value;
    private readonly SessionStoreOptions _store = storeOptions.Value;

    public string SessionName => _cookies.SessionName;

    public string PkceName => _cookies.PkceName;

    public void SetSession(HttpResponse response, string rawToken, DateTimeOffset expires)
    {
        ArgumentNullException.ThrowIfNull(response);
        response.Cookies.Append(_cookies.SessionName, rawToken, Build(expires));
    }

    public void ClearSession(HttpResponse response)
    {
        ArgumentNullException.ThrowIfNull(response);
        response.Cookies.Delete(_cookies.SessionName, Build(null));
    }

    public void SetPkce(HttpResponse response, PkceValues pkce, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(response);
        ArgumentNullException.ThrowIfNull(pkce);
        response.Cookies.Append(_cookies.PkceName, pkce.ToCookieValue(), Build(now + _store.PkceLifetime));
    }

    public void ClearPkce(HttpResponse response)
    {
        ArgumentNullException.ThrowIfNull(response);
        response.Cookies.Delete(_cookies.PkceName, Build(null));
    }

    internal CookieOptions Build(DateTimeOffset? expires)
    {
        CookieOptions options = new()
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            Path = "/",
            Secure = !environment.IsDevelopment(),
            IsEssential = true,
        };
        if (!string.IsNullOrEmpty(_cookies.Domain))
        {
            options.Domain = _cookies.Domain;
        }

        if (expires is not null)
        {
            options.Expires = expires;
        }

        return options;
    }
}
