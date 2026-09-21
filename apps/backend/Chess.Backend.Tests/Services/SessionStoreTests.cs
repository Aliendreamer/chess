namespace Chess.Backend.Tests.Services;

public sealed class SessionStoreTests
{
    private static readonly DateTimeOffset T0 = DateTimeOffset.Parse("2026-09-21T10:00:00Z", System.Globalization.CultureInfo.InvariantCulture);

    private static (SessionStore Store, ProjectDbContext Db, FakeClock Clock) Build()
    {
        FakeClock clock = new(T0);
        ProjectDbContext db = TestDb.Create(clock);
        return (new SessionStore(db, clock, NullLogger<SessionStore>.Instance), db, clock);
    }

    [Fact]
    public async Task Create_stores_only_the_hash_and_returns_raw_token()
    {
        (SessionStore store, ProjectDbContext db, _) = Build();

        string raw = await store.CreateAsync("sub-1", "at", "rt", T0.AddMinutes(5), T0.AddHours(8), CancellationToken.None);

        UserSession row = await db.UserSessions.SingleAsync();
        Assert.Equal(SessionToken.Hash(raw), row.TokenHash);
        Assert.DoesNotContain(raw, row.TokenHash, StringComparison.Ordinal);
        Assert.Equal("sub-1", row.Subject);
        Assert.Equal(T0, row.CreatedAt);
        Assert.Equal(1, row.Version);
    }

    [Fact]
    public async Task GetValid_returns_live_session_and_null_for_unknown_or_empty()
    {
        (SessionStore store, _, _) = Build();
        string raw = await store.CreateAsync("sub-1", "at", "rt", T0.AddMinutes(5), T0.AddHours(8), CancellationToken.None);

        Assert.NotNull(await store.GetValidAsync(raw, CancellationToken.None));
        Assert.Null(await store.GetValidAsync("nope", CancellationToken.None));
        Assert.Null(await store.GetValidAsync(string.Empty, CancellationToken.None));
    }

    [Fact]
    public async Task GetValid_excludes_revoked_sessions()
    {
        (SessionStore store, _, _) = Build();
        string raw = await store.CreateAsync("sub-1", "at", "rt", T0.AddMinutes(5), T0.AddHours(8), CancellationToken.None);

        UserSession? revoked = await store.RevokeAsync(raw, CancellationToken.None);

        Assert.NotNull(revoked);
        Assert.Equal(T0, revoked.RevokedAt);
        Assert.Equal("rt", revoked.RefreshToken);
        Assert.Null(await store.GetValidAsync(raw, CancellationToken.None));
    }

    [Fact]
    public async Task Revoke_is_idempotent_and_null_for_unknown()
    {
        (SessionStore store, _, FakeClock clock) = Build();
        string raw = await store.CreateAsync("sub-1", "at", null, T0.AddMinutes(5), null, CancellationToken.None);

        UserSession? first = await store.RevokeAsync(raw, CancellationToken.None);
        clock.Advance(TimeSpan.FromMinutes(1));
        UserSession? second = await store.RevokeAsync(raw, CancellationToken.None);

        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.Equal(T0, second.RevokedAt);
        Assert.Null(await store.RevokeAsync("unknown", CancellationToken.None));
        Assert.Null(await store.RevokeAsync(string.Empty, CancellationToken.None));
    }

    [Fact]
    public async Task GetValid_excludes_fully_expired_sessions_but_keeps_refreshable_ones()
    {
        (SessionStore store, _, FakeClock clock) = Build();
        string refreshable = await store.CreateAsync("s", "at", "rt", T0.AddMinutes(5), T0.AddHours(8), CancellationToken.None);
        string noRefresh = await store.CreateAsync("s", "at", null, T0.AddMinutes(5), null, CancellationToken.None);
        string openEndedRefresh = await store.CreateAsync("s", "at", "rt", T0.AddMinutes(5), null, CancellationToken.None);

        clock.Advance(TimeSpan.FromMinutes(10));
        Assert.NotNull(await store.GetValidAsync(refreshable, CancellationToken.None));
        Assert.Null(await store.GetValidAsync(noRefresh, CancellationToken.None));
        Assert.NotNull(await store.GetValidAsync(openEndedRefresh, CancellationToken.None));

        clock.Advance(TimeSpan.FromHours(9));
        Assert.Null(await store.GetValidAsync(refreshable, CancellationToken.None));
    }

    [Fact]
    public async Task UpdateTokens_replaces_tokens_and_keeps_refresh_when_idp_omits_it()
    {
        (SessionStore store, ProjectDbContext db, _) = Build();
        string raw = await store.CreateAsync("s", "at1", "rt1", T0.AddMinutes(5), T0.AddHours(8), CancellationToken.None);
        UserSession session = await db.UserSessions.SingleAsync();

        await store.UpdateTokensAsync(session.Id, "at2", null, T0.AddMinutes(10), null, CancellationToken.None);

        UserSession updated = await db.UserSessions.SingleAsync();
        Assert.Equal("at2", updated.AccessToken);
        Assert.Equal("rt1", updated.RefreshToken);
        Assert.Equal(T0.AddMinutes(10), updated.AccessTokenExpiresAt);
        Assert.Equal(T0.AddHours(8), updated.RefreshTokenExpiresAt);
        Assert.Equal(2, updated.Version);
        Assert.NotNull(await store.GetValidAsync(raw, CancellationToken.None));

        await store.UpdateTokensAsync(session.Id, "at3", "rt3", T0.AddMinutes(15), T0.AddHours(9), CancellationToken.None);
        updated = await db.UserSessions.SingleAsync();
        Assert.Equal("rt3", updated.RefreshToken);
        Assert.Equal(T0.AddHours(9), updated.RefreshTokenExpiresAt);
    }

    [Fact]
    public async Task RevokeAllForSubject_revokes_only_that_subjects_live_sessions()
    {
        (SessionStore store, _, _) = Build();
        string a1 = await store.CreateAsync("a", "at", "rt", T0.AddMinutes(5), T0.AddHours(8), CancellationToken.None);
        string a2 = await store.CreateAsync("a", "at", "rt", T0.AddMinutes(5), T0.AddHours(8), CancellationToken.None);
        string b1 = await store.CreateAsync("b", "at", "rt", T0.AddMinutes(5), T0.AddHours(8), CancellationToken.None);
        await store.RevokeAsync(a2, CancellationToken.None);

        int count = await store.RevokeAllForSubjectAsync("a", CancellationToken.None);

        Assert.Equal(1, count);
        Assert.Null(await store.GetValidAsync(a1, CancellationToken.None));
        Assert.NotNull(await store.GetValidAsync(b1, CancellationToken.None));
    }

    [Fact]
    public async Task Purge_removes_only_dead_rows_older_than_grace()
    {
        (SessionStore store, ProjectDbContext db, FakeClock clock) = Build();
        string live = await store.CreateAsync("s", "at", "rt", T0.AddHours(1), T0.AddHours(8), CancellationToken.None);
        string revokedOld = await store.CreateAsync("s", "at", "rt", T0.AddHours(1), T0.AddHours(8), CancellationToken.None);
        string expiredOld = await store.CreateAsync("s", "at", null, T0.AddMinutes(1), null, CancellationToken.None);
        await store.RevokeAsync(revokedOld, CancellationToken.None);

        clock.Advance(TimeSpan.FromHours(2));
        Assert.Equal(0, await store.PurgeAsync(TimeSpan.FromDays(1), CancellationToken.None));

        clock.Advance(TimeSpan.FromDays(1));
        Assert.Equal(2, await store.PurgeAsync(TimeSpan.FromDays(1), CancellationToken.None));
        Assert.Equal(1, await db.UserSessions.CountAsync());
        Assert.NotNull(await db.UserSessions.SingleOrDefaultAsync(s => s.TokenHash == SessionToken.Hash(live)));
        _ = expiredOld;
    }

    [Fact]
    public async Task Create_rejects_empty_arguments()
    {
        (SessionStore store, _, _) = Build();
        await Assert.ThrowsAsync<ArgumentException>(() => store.CreateAsync(string.Empty, "at", null, T0, null, CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() => store.CreateAsync("s", string.Empty, null, T0, null, CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() => store.RevokeAllForSubjectAsync(string.Empty, CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() => store.UpdateTokensAsync(1, string.Empty, null, T0, null, CancellationToken.None));
    }

    [Fact]
    public void IsUsable_truth_table()
    {
        DateTimeOffset now = T0;
        Assert.True(SessionStore.IsUsable(new UserSession { TokenHash = "h", Subject = "s", AccessToken = "a", AccessTokenExpiresAt = now.AddMinutes(1) }, now));
        Assert.False(SessionStore.IsUsable(new UserSession { TokenHash = "h", Subject = "s", AccessToken = "a", AccessTokenExpiresAt = now.AddMinutes(-1) }, now));
        Assert.True(SessionStore.IsUsable(new UserSession { TokenHash = "h", Subject = "s", AccessToken = "a", AccessTokenExpiresAt = now.AddMinutes(-1), RefreshToken = "r" }, now));
        Assert.False(SessionStore.IsUsable(new UserSession { TokenHash = "h", Subject = "s", AccessToken = "a", AccessTokenExpiresAt = now.AddMinutes(-1), RefreshToken = "r", RefreshTokenExpiresAt = now.AddMinutes(-1) }, now));
        Assert.False(SessionStore.IsUsable(new UserSession { TokenHash = "h", Subject = "s", AccessToken = "a", AccessTokenExpiresAt = now.AddMinutes(1), RevokedAt = now }, now));
    }
}
