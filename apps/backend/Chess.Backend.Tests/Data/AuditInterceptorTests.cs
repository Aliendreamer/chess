namespace Chess.Backend.Tests.Data;

public sealed class AuditInterceptorTests
{
    private static readonly DateTimeOffset T0 = Time.Utc("2026-09-21T10:00:00Z");

    [Fact]
    public async Task Stamps_created_and_updated_on_insert_then_bumps_version_on_update()
    {
        FakeClock clock = new(T0);
        using ProjectDbContext db = TestDb.Create(clock);
        User user = new() { Sub = "s" };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        Assert.Equal(T0, user.CreatedAt);
        Assert.Equal(T0, user.UpdatedAt);
        Assert.Equal(1, user.Version);

        clock.Advance(TimeSpan.FromMinutes(1));
        user.Email = "e@x.y";
        await db.SaveChangesAsync();

        Assert.Equal(T0, user.CreatedAt);
        Assert.Equal(T0.AddMinutes(1), user.UpdatedAt);
        Assert.Equal(2, user.Version);
    }

    [Fact]
    public void Synchronous_save_is_stamped_too()
    {
        FakeClock clock = new(T0);
        using ProjectDbContext db = TestDb.Create(clock);
        User user = new() { Sub = "s" };
        db.Users.Add(user);
        db.SaveChanges();
        Assert.Equal(1, user.Version);
        Assert.Equal(T0, user.CreatedAt);

        db.Users.Remove(user);
        db.SaveChanges();
        Assert.Equal(1, user.Version);
    }

    [Fact]
    public async Task Design_time_factory_builds_a_context_and_seed_is_a_noop()
    {
        using ProjectDbContext ctx = new ProjectDbContextFactory().CreateDbContext([]);
        Assert.NotNull(ctx.Users);
        Assert.NotNull(ctx.UserSessions);
        using ProjectDbContext db = TestDb.Create();
        await SeedData.SeedAsync(db, CancellationToken.None);
        Assert.Equal(0, await db.Users.CountAsync());
    }

    [Fact]
    public void Model_configuration_marks_session_as_revoked_when_revoked_at_set()
    {
        UserSession s = new() { TokenHash = "h", Subject = "s", AccessToken = "a" };
        Assert.False(s.IsRevoked);
        s.RevokedAt = T0;
        Assert.True(s.IsRevoked);
    }
}
