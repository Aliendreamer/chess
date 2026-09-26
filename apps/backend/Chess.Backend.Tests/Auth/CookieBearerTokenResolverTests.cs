using Microsoft.AspNetCore.Http;

namespace Chess.Backend.Tests.Auth;

public sealed class CookieBearerTokenResolverTests
{
    private const string Cookie = "mp_sid";
    private static readonly DateTimeOffset T0 = Time.Utc("2026-09-21T10:00:00Z");
    private static readonly TimeSpan Leeway = TimeSpan.FromSeconds(30);

    private static HttpRequest Request(string? cookie = null, string? authorization = null)
    {
        DefaultHttpContext ctx = new();
        if (cookie is not null)
        {
            ctx.Request.Headers.Cookie = $"{Cookie}={cookie}";
        }

        if (authorization is not null)
        {
            ctx.Request.Headers.Authorization = authorization;
        }

        return ctx.Request;
    }

    private static UserSession Session(DateTimeOffset accessExp, string? refresh = "rt", DateTimeOffset? refreshExp = null) => new()
    {
        Id = 7,
        TokenHash = "h",
        Subject = "s",
        AccessToken = "access-1",
        RefreshToken = refresh,
        AccessTokenExpiresAt = accessExp,
        RefreshTokenExpiresAt = refreshExp,
    };

    private static Task<string?> Resolve(HttpRequest request, ISessionStore store, IKeycloakOidcClient oidc) =>
        CookieBearerTokenResolver.ResolveTokenAsync(request, Cookie, store, oidc, new FakeClock(T0), Leeway, NullLogger.Instance, CancellationToken.None);

    /// <summary>A store whose cookie <c>raw</c> resolves to <paramref name="session"/> (null = unknown or revoked).</summary>
    private static Mock<ISessionStore> StoreReturning(UserSession? session)
    {
        Mock<ISessionStore> store = new();
        store.Setup(s => s.GetValidAsync("raw", It.IsAny<CancellationToken>())).ReturnsAsync(session);
        return store;
    }

    [Fact]
    public async Task Authorization_header_wins_and_cookie_is_ignored()
    {
        Mock<ISessionStore> store = new(MockBehavior.Strict);
        string? token = await Resolve(Request("raw", "Bearer abc"), store.Object, Mock.Of<IKeycloakOidcClient>());
        Assert.Null(token);
        store.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task No_cookie_is_anonymous()
    {
        Mock<ISessionStore> store = new(MockBehavior.Strict);
        Assert.Null(await Resolve(Request(), store.Object, Mock.Of<IKeycloakOidcClient>()));
        Assert.Null(await Resolve(Request(string.Empty), store.Object, Mock.Of<IKeycloakOidcClient>()));
    }

    [Fact]
    public async Task Unknown_or_revoked_session_is_anonymous()
    {
        Mock<ISessionStore> store = StoreReturning(null);
        Assert.Null(await Resolve(Request("raw"), store.Object, Mock.Of<IKeycloakOidcClient>()));
    }

    [Fact]
    public async Task Fresh_access_token_is_returned_without_refresh()
    {
        Mock<ISessionStore> store = StoreReturning(Session(T0.AddMinutes(5)));
        Mock<IKeycloakOidcClient> oidc = new(MockBehavior.Strict);

        Assert.Equal("access-1", await Resolve(Request("raw"), store.Object, oidc.Object));
        oidc.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Token_inside_leeway_window_is_refreshed()
    {
        Mock<ISessionStore> store = StoreReturning(Session(T0.AddSeconds(10), "rt", T0.AddHours(1)));
        Mock<IKeycloakOidcClient> oidc = new();
        oidc.Setup(o => o.RefreshAsync("rt", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TokenResponse("access-2", "rt-2", 300, 3600, null));

        string? token = await Resolve(Request("raw"), store.Object, oidc.Object);

        Assert.Equal("access-2", token);
        store.Verify(s => s.UpdateTokensAsync(7, "access-2", "rt-2", T0.AddSeconds(300), T0.AddSeconds(3600), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Expired_access_with_refresh_but_idp_omits_refresh_expiry()
    {
        Mock<ISessionStore> store = StoreReturning(Session(T0.AddMinutes(-1)));
        Mock<IKeycloakOidcClient> oidc = new();
        oidc.Setup(o => o.RefreshAsync("rt", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TokenResponse("access-2", null, 300, 0, null));

        Assert.Equal("access-2", await Resolve(Request("raw"), store.Object, oidc.Object));
        store.Verify(s => s.UpdateTokensAsync(7, "access-2", null, T0.AddSeconds(300), null, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Expired_access_without_refresh_token_is_anonymous()
    {
        Mock<ISessionStore> store = StoreReturning(Session(T0.AddMinutes(-1), refresh: null));
        Mock<IKeycloakOidcClient> oidc = new(MockBehavior.Strict);

        Assert.Null(await Resolve(Request("raw"), store.Object, oidc.Object));
    }

    [Fact]
    public async Task Expired_refresh_token_is_anonymous()
    {
        Mock<ISessionStore> store = StoreReturning(Session(T0.AddMinutes(-1), "rt", T0.AddMinutes(-1)));
        Mock<IKeycloakOidcClient> oidc = new(MockBehavior.Strict);

        Assert.Null(await Resolve(Request("raw"), store.Object, oidc.Object));
    }

    [Fact]
    public async Task Idp_refusing_the_refresh_is_anonymous_not_an_error()
    {
        Mock<ISessionStore> store = StoreReturning(Session(T0.AddMinutes(-1)));
        Mock<IKeycloakOidcClient> oidc = new();
        oidc.Setup(o => o.RefreshAsync("rt", It.IsAny<CancellationToken>())).ThrowsAsync(new HttpRequestException("400"));

        Assert.Null(await Resolve(Request("raw"), store.Object, oidc.Object));
        store.Verify(s => s.UpdateTokensAsync(It.IsAny<long>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<DateTimeOffset>(), It.IsAny<DateTimeOffset?>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
