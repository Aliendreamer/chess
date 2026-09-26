using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;

namespace Chess.Backend.Tests.Auth;

public sealed class SessionCookiesTests
{
    private static readonly DateTimeOffset T0 = Time.Utc("2026-09-21T10:00:00Z");

    private static SessionCookies Build(string environment, string domain = ".chess.localhost")
    {
        Mock<IWebHostEnvironment> env = new();
        env.SetupGet(e => e.EnvironmentName).Returns(environment);
        return new SessionCookies(
            Options.Create(new SessionCookieOptions { Domain = domain, SessionName = "mp_sid", PkceName = "mp_pkce" }),
            Options.Create(new SessionStoreOptions { PkceLifetime = TimeSpan.FromMinutes(10) }),
            env.Object);
    }

    [Fact]
    public void Development_cookies_are_httponly_lax_domain_scoped_and_not_secure()
    {
        CookieOptions o = Build(Environments.Development).Build(T0);
        Assert.True(o.HttpOnly);
        Assert.Equal(SameSiteMode.Lax, o.SameSite);
        Assert.Equal("/", o.Path);
        Assert.Equal(".chess.localhost", o.Domain);
        Assert.False(o.Secure);
        Assert.Equal(T0, o.Expires);
    }

    [Fact]
    public void Production_cookies_are_secure_and_empty_domain_means_host_only()
    {
        CookieOptions o = Build(Environments.Production, domain: string.Empty).Build(null);
        Assert.True(o.Secure);
        Assert.Null(o.Domain);
        Assert.Null(o.Expires);
    }

    [Fact]
    public void Set_and_clear_write_the_expected_headers()
    {
        SessionCookies cookies = Build(Environments.Development);
        DefaultHttpContext ctx = new();
        PkceValues pkce = Pkce.Create();

        cookies.SetSession(ctx.Response, "raw-token", T0.AddHours(8));
        cookies.SetPkce(ctx.Response, pkce, T0);
        string[] set = ctx.Response.Headers.SetCookie.ToArray()!;

        Assert.Contains(set, h => h.StartsWith("mp_sid=raw-token", StringComparison.Ordinal) && h.Contains("httponly", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(set, h => h.StartsWith("mp_pkce=", StringComparison.Ordinal) && h.Contains(pkce.Verifier, StringComparison.Ordinal));
        Assert.Equal("mp_sid", cookies.SessionName);
        Assert.Equal("mp_pkce", cookies.PkceName);

        DefaultHttpContext cleared = new();
        cookies.ClearSession(cleared.Response);
        cookies.ClearPkce(cleared.Response);
        string[] del = cleared.Response.Headers.SetCookie.ToArray()!;
        Assert.Equal(2, del.Length);
        Assert.All(del, h => Assert.Contains("expires=Thu, 01 Jan 1970", h, StringComparison.OrdinalIgnoreCase));
    }
}
