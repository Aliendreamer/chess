using Chess.Backend.Data.ReadModels;

namespace Chess.Backend.Tests.Data;

public sealed class ReadDbContextTests
{
    private static ReadDbContext Create() => new(new DbContextOptionsBuilder<ReadDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options);

    [Fact]
    public void Model_contains_only_read_models_and_never_tracks()
    {
        using ReadDbContext db = Create();
        string[] entities = db.Model.GetEntityTypes().Select(e => e.ClrType.Name).Order().ToArray();
        Assert.Equal(["RmGame", "RmGamePlayer", "RmMove", "RmPing"], entities);
        Assert.Equal(QueryTrackingBehavior.NoTracking, db.ChangeTracker.QueryTrackingBehavior);
    }

    [Fact]
    public void Write_context_maps_the_same_table_so_migrations_create_it()
    {
        using ProjectDbContext db = TestDb.Create();
        Assert.Equal("rm_pings", db.Model.FindEntityType(typeof(RmPing))!.GetTableName());
    }

    [Fact]
    public async Task Save_changes_is_refused_on_the_read_context()
    {
        using ReadDbContext db = Create();
        db.Add(new RmPing { PingId = "p1" });
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }
}
