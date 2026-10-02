using Chess.Backend.Data.ModelConfigurations;
using Chess.Backend.Data.ReadModels;
using Microsoft.EntityFrameworkCore.Design;

namespace Chess.Backend.Data;

internal sealed class ProjectDbContext(DbContextOptions<ProjectDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    public DbSet<UserSession> UserSessions => Set<UserSession>();

    /// <summary>Mapped here too so migrations create the table on the primary; the projection writes it, the replica serves reads.</summary>
    public DbSet<RmPing> RmPings => Set<RmPing>();

    public DbSet<OutboxOffset> OutboxOffsets => Set<OutboxOffset>();

    public DbSet<ConsumerPosition> ConsumerPositions => Set<ConsumerPosition>();

    public DbSet<ProjectionDeadLetter> ProjectionDeadLetters => Set<ProjectionDeadLetter>();

    public DbSet<RmGame> RmGames => Set<RmGame>();

    public DbSet<RmGamePlayer> RmGamePlayers => Set<RmGamePlayer>();

    public DbSet<RmMove> RmMoves => Set<RmMove>();

    public DbSet<EngineGame> EngineGames => Set<EngineGame>();

    public DbSet<GameDeadline> GameDeadlines => Set<GameDeadline>();

    public DbSet<NotificationGame> NotificationGames => Set<NotificationGame>();

    public DbSet<Study> Studies => Set<Study>();

    public DbSet<PositionEvaluation> PositionEvaluations => Set<PositionEvaluation>();

    public DbSet<LibraryGame> LibraryGames => Set<LibraryGame>();

    public DbSet<LibraryPosition> LibraryPositions => Set<LibraryPosition>();

    public DbSet<Opening> Openings => Set<Opening>();

    public DbSet<NewsItem> NewsItems => Set<NewsItem>();

    public DbSet<ChessEvent> ChessEvents => Set<ChessEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.UseIdentityAlwaysColumns();
        modelBuilder.HasPostgresExtension("pg_trgm"); // the library's name and event search (game-library)
        // PlayerIdentity is the replica's narrow view of users (ReadDbContext only); here users is the User entity.
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ProjectDbContext).Assembly, t => t != typeof(PlayerIdentityConfiguration));
    }
}

/// <summary>Design-time factory for <c>dotnet ef</c>; the connection string is never opened for migrations.</summary>
internal sealed class ProjectDbContextFactory : IDesignTimeDbContextFactory<ProjectDbContext>
{
    public ProjectDbContext CreateDbContext(string[] args)
    {
        string connectionString = Environment.GetEnvironmentVariable($"ConnectionStrings__{Constants.ConnectionStrings.Postgres}")
            ?? "Host=localhost;Port=5432;Database=chess;Username=chess;Password=chess";
        DbContextOptionsBuilder<ProjectDbContext> builder = new();
        builder.UseNpgsql(connectionString);
        return new ProjectDbContext(builder.Options);
    }
}

/// <summary>Placeholder for reference data. Users are JIT-provisioned from Keycloak, so nothing seeds yet.</summary>
internal static class SeedData
{
    public static Task SeedAsync(ProjectDbContext context, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(context);
        return Library.OpeningSeed.SeedAsync(context, ct);
    }
}
