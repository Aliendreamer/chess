using Chess.Backend.Data.ModelConfigurations;
using Chess.Backend.Data.ReadModels;

namespace Chess.Backend.Data;

/// <summary>Replica-bound, read-only: only rm_* tables are mapped, tracking is off, SaveChanges throws.</summary>
internal sealed class ReadDbContext : DbContext
{
    public ReadDbContext(DbContextOptions<ReadDbContext> options) : base(options)
    {
        ChangeTracker.QueryTrackingBehavior = QueryTrackingBehavior.NoTracking;
    }

    public DbSet<RmPing> RmPings => Set<RmPing>();

    public DbSet<RmGame> RmGames => Set<RmGame>();

    public DbSet<RmGamePlayer> RmGamePlayers => Set<RmGamePlayer>();

    public DbSet<RmMove> RmMoves => Set<RmMove>();

    public override int SaveChanges(bool acceptAllChangesOnSuccess) =>
        throw new InvalidOperationException("ReadDbContext is read-only (replica).");

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default) =>
        throw new InvalidOperationException("ReadDbContext is read-only (replica).");

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfiguration(new RmPingConfiguration());
        modelBuilder.ApplyConfiguration(new RmGameConfiguration());
        modelBuilder.ApplyConfiguration(new RmGamePlayerConfiguration());
        modelBuilder.ApplyConfiguration(new RmMoveConfiguration());
    }
}
