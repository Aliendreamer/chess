using ZiggyCreatures.Caching.Fusion;

namespace Chess.Backend.Tests.Services;

public sealed class UserProvisioningServiceTests
{
    private static UserProvisioningService Build(ProjectDbContext db, IFusionCache? cache = null) =>
        new(db, cache ?? new FusionCache(new FusionCacheOptions()), NullLogger<UserProvisioningService>.Instance);

    [Fact]
    public async Task First_sight_creates_the_user_and_later_calls_reuse_it()
    {
        using ProjectDbContext db = TestDb.Create();
        UserProvisioningService svc = Build(db);

        long first = await svc.EnsureUserAsync("sub-1", "a@b.c", "Ann", CancellationToken.None);
        long again = await svc.EnsureUserAsync("sub-1", "changed@b.c", "Ann", CancellationToken.None);

        Assert.Equal(first, again);
        User user = await db.Users.SingleAsync();
        Assert.Equal("sub-1", user.Sub);
        Assert.Equal("a@b.c", user.Email);
        Assert.Equal("Ann", user.FullName);
    }

    [Fact]
    public async Task Cache_miss_with_existing_row_returns_existing_id()
    {
        string dbName = Guid.NewGuid().ToString("N");
        using (ProjectDbContext seed = TestDb.Create(name: dbName))
        {
            seed.Users.Add(new User { Sub = "sub-2", Email = "x@y.z" });
            await seed.SaveChangesAsync();
        }

        using ProjectDbContext db = TestDb.Create(name: dbName);
        long id = await Build(db).EnsureUserAsync("sub-2", null, null, CancellationToken.None);

        Assert.Equal((await db.Users.SingleAsync()).Id, id);
        Assert.Equal(1, await db.Users.CountAsync());
    }

    [Fact]
    public async Task Different_subjects_get_different_users()
    {
        using ProjectDbContext db = TestDb.Create();
        UserProvisioningService svc = Build(db);

        long a = await svc.EnsureUserAsync("a", null, null, CancellationToken.None);
        long b = await svc.EnsureUserAsync("b", null, null, CancellationToken.None);

        Assert.NotEqual(a, b);
        Assert.Equal(2, await db.Users.CountAsync());
    }

    [Fact]
    public async Task Rejects_empty_subject()
    {
        using ProjectDbContext db = TestDb.Create();
        await Assert.ThrowsAsync<ArgumentException>(() => Build(db).EnsureUserAsync(string.Empty, null, null, CancellationToken.None));
    }
}
