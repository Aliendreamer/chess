using Chess.Backend.Akka;
using Chess.Backend.Akka.Outbox;
using Chess.Backend.Messaging;
using Chess.Backend.Projections;
using Chess.Backend.WebApi.Lobby;
using FastEndpoints.Swagger;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Scalar.AspNetCore;
using Serilog;

namespace Chess.Backend.Extensions;

internal static class ApplicationExtensions
{
    public static WebApplication UseRequestPipeline(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.UseForwardedHeaders(BuildForwardedHeaders(app.Configuration));
        app.UseSecurityHeaders();
        app.UseExceptionHandler(static _ => { });
        app.UseSerilogRequestLogging();
        app.UseCors(Constants.CorsPolicy);
        // Before the limiter: it keys on the validated user (BuilderExtension.ClientKey).
        app.UseAuthentication();
        app.UseRateLimiter();
        app.UseAuthorization();

        app.MapHealthChecks(Constants.HealthPath);
        app.MapHub<LiveHub>(LiveHub.Path).RequireCors(Constants.CorsPolicy);
        app.UseFastEndpoints(c =>
        {
            c.Endpoints.RoutePrefix = Constants.RoutePrefix;
            c.Endpoints.Configurator = ep =>
            {
                ep.Options(b => b.RequireCors(Constants.CorsPolicy));
                ep.PreProcessor<UserProvisioningPreProcessor>(Order.Before);
            };
            c.Errors.UseProblemDetails();
        });

        if (app.Environment.IsDevelopment())
        {
            app.UseSwaggerGen();
            app.MapScalarApiReference(o => o.WithOpenApiRoutePattern("/swagger/{documentName}/swagger.json"));
        }

        return app;
    }

    /// <summary>
    /// X-Forwarded-* is honoured only from the edge proxies listed in <c>ForwardedHeaders:KnownNetworks</c>
    /// (CIDRs) / <c>KnownProxies</c> (IPs); with nothing configured ASP.NET's loopback-only default stays, so a
    /// caller that reaches the API directly cannot spoof its address. <c>ForwardLimit = 1</c> reads only the
    /// entry the trusted edge itself appended, never a client-supplied one further left.
    /// </summary>
    internal static ForwardedHeadersOptions BuildForwardedHeaders(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ForwardedHeadersOptions options = new()
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost,
            ForwardLimit = 1,
        };
        IConfigurationSection section = configuration.GetSection(Constants.ConfigKeys.ForwardedHeaders);
        foreach (string cidr in section.GetSection("KnownNetworks").Get<string[]>() ?? [])
        {
            options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(cidr));
        }

        foreach (string ip in section.GetSection("KnownProxies").Get<string[]>() ?? [])
        {
            options.KnownProxies.Add(System.Net.IPAddress.Parse(ip));
        }

        return options;
    }
}

internal static class FastEndpointSetup
{
    public static WebApplicationBuilder AddEndpoints(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.Services.AddFastEndpoints();
        builder.Services.AddSettings<ApiOptions>(builder.Configuration, ApiOptions.SectionName);
        builder.Services.AddSettings<LobbyOptions>(builder.Configuration, LobbyOptions.SectionName);
        builder.Services.SwaggerDocument(o =>
        {
            o.DocumentSettings = s =>
            {
                s.Title = "Chess API";
                s.Version = "v1";
            };
            o.ShortSchemaNames = true;
        });

        string connectionString = builder.Configuration.GetConnectionString(Constants.ConnectionStrings.Postgres) ?? string.Empty;
        IHealthChecksBuilder health = builder.Services.AddHealthChecks().AddNpgSql(connectionString, name: Constants.HealthChecks.Postgres);
        string? redis = builder.Configuration.GetConnectionString(Constants.ConnectionStrings.Redis);
        if (!string.IsNullOrEmpty(redis))
        {
            health.AddRedis(redis, name: Constants.HealthChecks.Redis);
        }

        health.AddCheck<ClusterHealthCheck>(Constants.HealthChecks.AkkaCluster);
        // Always on: the table lives on the primary whether or not Kafka is configured, and Degraded (never
        // Unhealthy) keeps a quarantined game from pulling the API out of rotation.
        health.AddCheck<DeadLetterService>(Constants.HealthChecks.ProjectionDeadLetters, failureStatus: HealthStatus.Degraded);

        KafkaOptions kafka = builder.Configuration.GetSection(KafkaOptions.SectionName).Get<KafkaOptions>() ?? new KafkaOptions();
        health.AddKafkaHealthCheck(builder.Services, kafka, builder.Configuration);

        return builder;
    }

    /// <summary>
    /// Registers the <c>"kafka"</c> and <c>"journal-publisher"</c> health checks only when Kafka is enabled. Extracted so the branch is
    /// unit-testable against the real registration instead of a copy of it.
    /// </summary>
    internal static IHealthChecksBuilder AddKafkaHealthCheck(this IHealthChecksBuilder health, IServiceCollection services, KafkaOptions kafka, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(health);
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(kafka);
        if (kafka.Enabled)
        {
            // Singleton so the AdminClient (and its broker connection) is built once, not per health probe.
            services.AddSingleton<KafkaHealthCheck>();
            health.AddCheck<KafkaHealthCheck>(Constants.HealthChecks.Kafka);
            // Registered with the Kafka check because it only means something while the journal publisher runs.
            services.AddSettings<PublisherLagOptions>(configuration, PublisherLagOptions.SectionName);
            services.AddSingleton(sp => new PublisherLagHealthCheck(
                sp.GetRequiredService<IConfiguration>().GetConnectionString(Constants.ConnectionStrings.Postgres) ?? string.Empty,
                sp.GetRequiredService<TimeProvider>(),
                sp.GetRequiredService<PublisherLagOptions>()));
            health.AddCheck<PublisherLagHealthCheck>(Constants.HealthChecks.JournalPublisher, failureStatus: HealthStatus.Degraded);
        }

        return health;
    }
}

/// <summary>
/// Endpoint timeouts and limits (section <c>Api</c>), read by the endpoints instead of constants in each file. The
/// defaults are the values the endpoints have always used.
/// </summary>
internal sealed class ApiOptions : ISettings
{
    public const string SectionName = "Api";

    /// <summary>How long an endpoint waits for an actor's answer before a 504.</summary>
    public int AskTimeoutSeconds { get; set; } = 5;

    /// <summary>Accepting an invite starts a game, so its answer may take longer.</summary>
    public int InviteAskTimeoutSeconds { get; set; } = 10;

    /// <summary>The page a list endpoint returns when the request names no <c>limit</c>.</summary>
    public int DefaultPageSize { get; set; } = 50;

    /// <summary>The largest page a list endpoint returns; a larger <c>limit</c> is clamped to it.</summary>
    public int MaxPageSize { get; set; } = 200;

    public void Validate()
    {
        if (AskTimeoutSeconds <= 0 || InviteAskTimeoutSeconds <= 0)
        {
            throw new InvalidOperationException("Api:AskTimeoutSeconds and Api:InviteAskTimeoutSeconds must be positive.");
        }

        if (DefaultPageSize <= 0 || MaxPageSize < DefaultPageSize)
        {
            throw new InvalidOperationException("Api:MaxPageSize must be at least Api:DefaultPageSize, and both positive.");
        }
    }

    public TimeSpan AskTimeout => TimeSpan.FromSeconds(AskTimeoutSeconds);

    public TimeSpan InviteAskTimeout => TimeSpan.FromSeconds(InviteAskTimeoutSeconds);
}
