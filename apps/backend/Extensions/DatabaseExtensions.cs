using Npgsql;

namespace Chess.Backend.Extensions;

/// <summary>Both databases: the primary for writes (ProjectDbContext) and the replica for reads (ReadDbContext).</summary>
internal static class DatabaseExtensions
{
    public static WebApplicationBuilder AddDatabaseContext(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        string connectionString = builder.Configuration.GetConnectionString(Constants.ConnectionStrings.Postgres)
            ?? throw new InvalidOperationException("ConnectionStrings:Postgres is not configured.");

        builder.Services.AddSingleton<AuditInterceptor>();
        builder.Services.AddDbContext<ProjectDbContext>((sp, options) => options
            .UseNpgsql(connectionString, npgsql => npgsql.EnableRetryOnFailure())
            .AddInterceptors(sp.GetRequiredService<AuditInterceptor>()));
        return builder;
    }

    /// <summary>Applies pending migrations then seeds. Run once at startup, before serving traffic.</summary>
    public static async Task MigrateAndSeedDbAsync(this WebApplication app, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(app);
        using IServiceScope scope = app.Services.CreateScope();
        ProjectDbContext context = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
        List<string> pending = [.. await context.Database.GetPendingMigrationsAsync(ct)];
        string database = context.Database.GetDbConnection().Database;
        Log.MigrationsApplying(app.Logger, pending.Count, database);
        await context.Database.MigrateAsync(ct);
        await SeedData.SeedAsync(context, ct);
    }

    // The read side: ReadDbContext on the replica, no tracking, with its health check.
    public const string ReplicaDataSourceKey = "replica";

    public static WebApplicationBuilder AddReadDatabaseContext(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        string replica = builder.Configuration.GetConnectionString(Constants.ConnectionStrings.PostgresReplica)
            ?? throw new InvalidOperationException("ConnectionStrings:PostgresReplica is not configured.");
        NpgsqlDataSource source = new NpgsqlDataSourceBuilder(replica).Build();
        builder.Services.AddKeyedSingleton(ReplicaDataSourceKey, source);
        builder.Services.AddDbContext<ReadDbContext>(o => o
            .UseNpgsql(source, npgsql => npgsql.EnableRetryOnFailure())
            .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking));
        builder.Services.AddHealthChecks().AddCheck<ReplicaHealthCheck>(Constants.HealthChecks.PostgresReplica);
        return builder;
    }
}
