namespace Chess.Backend.Tests.Support;

internal static class TestDb
{
    public static ProjectDbContext Create(TimeProvider? clock = null, string? name = null)
    {
        DbContextOptions<ProjectDbContext> options = new DbContextOptionsBuilder<ProjectDbContext>()
            .UseInMemoryDatabase(name ?? Guid.NewGuid().ToString("N"))
            .AddInterceptors(new AuditInterceptor(clock ?? TimeProvider.System))
            .Options;
        return new ProjectDbContext(options);
    }
}
