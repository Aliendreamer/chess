using Chess.Backend.Data.ReadModels;

namespace Chess.Backend.Data;

internal sealed class ProjectDbContext(DbContextOptions<ProjectDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    public DbSet<UserSession> UserSessions => Set<UserSession>();

    /// <summary>Mapped here too so migrations create the table on the primary; the projection writes it, the replica serves reads.</summary>
    public DbSet<RmPing> RmPings => Set<RmPing>();

    public DbSet<OutboxOffset> OutboxOffsets => Set<OutboxOffset>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.UseIdentityAlwaysColumns();
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ProjectDbContext).Assembly);
    }
}
