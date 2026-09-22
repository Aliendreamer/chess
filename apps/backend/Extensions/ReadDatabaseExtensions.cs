using Chess.Backend.Data;
using Npgsql;

namespace Chess.Backend.Extensions;

internal static class ReadDatabaseExtensions
{
    public const string ReplicaDataSourceKey = "replica";

    public static WebApplicationBuilder AddReadDatabaseContext(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        string replica = builder.Configuration.GetConnectionString("PostgresReplica")
            ?? throw new InvalidOperationException("ConnectionStrings:PostgresReplica is not configured.");
        NpgsqlDataSource source = new NpgsqlDataSourceBuilder(replica).Build();
        builder.Services.AddKeyedSingleton(ReplicaDataSourceKey, source);
        builder.Services.AddDbContext<ReadDbContext>(o => o
            .UseNpgsql(source, npgsql => npgsql.EnableRetryOnFailure())
            .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking));
        builder.Services.AddHealthChecks().AddCheck<ReplicaHealthCheck>("postgres-replica");
        return builder;
    }
}
