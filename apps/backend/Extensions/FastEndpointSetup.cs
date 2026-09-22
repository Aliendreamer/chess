using Chess.Backend.Akka;
using Chess.Backend.Messaging;
using FastEndpoints.Swagger;

namespace Chess.Backend.Extensions;

internal static class FastEndpointSetup
{
    public static WebApplicationBuilder AddEndpoints(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.Services.AddFastEndpoints();
        builder.Services.SwaggerDocument(o =>
        {
            o.DocumentSettings = s =>
            {
                s.Title = "Chess API";
                s.Version = "v1";
            };
            o.ShortSchemaNames = true;
        });

        string connectionString = builder.Configuration.GetConnectionString("Postgres") ?? string.Empty;
        IHealthChecksBuilder health = builder.Services.AddHealthChecks().AddNpgSql(connectionString, name: "postgres");
        string? redis = builder.Configuration.GetConnectionString("Redis");
        if (!string.IsNullOrEmpty(redis))
        {
            health.AddRedis(redis, name: "redis");
        }

        health.AddCheck<ClusterHealthCheck>("akka-cluster");

        KafkaOptions kafka = builder.Configuration.GetSection(KafkaOptions.SectionName).Get<KafkaOptions>() ?? new KafkaOptions();
        health.AddKafkaHealthCheck(builder.Services, kafka);

        return builder;
    }

    /// <summary>
    /// Registers the <c>"kafka"</c> health check only when Kafka is enabled. Extracted so the branch is
    /// unit-testable against the real registration instead of a copy of it.
    /// </summary>
    internal static IHealthChecksBuilder AddKafkaHealthCheck(this IHealthChecksBuilder health, IServiceCollection services, KafkaOptions kafka)
    {
        ArgumentNullException.ThrowIfNull(health);
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(kafka);
        if (kafka.Enabled)
        {
            // Singleton so the AdminClient (and its broker connection) is built once, not per health probe.
            services.AddSingleton<KafkaHealthCheck>();
            health.AddCheck<KafkaHealthCheck>("kafka");
        }

        return health;
    }
}
