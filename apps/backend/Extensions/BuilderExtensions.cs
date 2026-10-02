using System.Security.Claims;
using System.Threading.RateLimiting;
using Chess.Backend.Akka;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Akka.Outbox;
using Chess.Backend.Akka.Ping;
using Chess.Backend.Analysis;
using Chess.Backend.Correspondence;
using Chess.Backend.Engine;
using Chess.Backend.Messaging;
using Chess.Backend.News;
using Chess.Backend.Projections;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using RedisRateLimiting;
using Serilog;
using StackExchange.Redis;
using ZiggyCreatures.Caching.Fusion;

namespace Chess.Backend.Extensions;

internal static class BuilderExtension
{
    public static WebApplicationBuilder AddCommonServices(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        IServiceCollection services = builder.Services;
        ConfigurationManager configuration = builder.Configuration;
        bool isDevelopment = builder.Environment.IsDevelopment();

        KeycloakOptions keycloak = services.AddSettings<KeycloakOptions>(configuration, KeycloakOptions.SectionName);
        services.AddSettings<SessionCookieOptions>(configuration, SessionCookieOptions.SectionName);
        services.AddSettings<SessionStoreOptions>(configuration, SessionStoreOptions.SectionName);
        CacheOptions cache = services.AddSettings<CacheOptions>(configuration, CacheOptions.SectionName);
        services.AddSettings<DatabaseOptions>(configuration, DatabaseOptions.SectionName);

        services.AddSingleton(TimeProvider.System);
        string? redis = configuration.GetConnectionString(Constants.ConnectionStrings.Redis);
        services.AddCaching(redis, cache);
        services.AddHttpClient(Constants.KeycloakHttpClient, client => client.Timeout = TimeSpan.FromSeconds(keycloak.HttpTimeoutSeconds));
        services.AddSingleton<IKeycloakOidcClient, KeycloakOidcClient>();
        services.AddSingleton<SessionCookies>();
        services.AddScoped<CurrentUser>();
        services.AddScoped<ICurrentUser>(sp => sp.GetRequiredService<CurrentUser>());
        services.AddSingleton<IClaimsTransformation, KeycloakRolesClaimsTransformation>();
        services.AddHostedService<SessionCleanupService>();
        services.AddConventionServices();
        services.AddObservability(configuration, ObservabilityExtensions.NodeName(configuration));
        AddMessaging(services, configuration);
        services.AddSignalR();
        // One source per live kind; the resolver refuses two for the same kind at startup.
        services.AddSingleton<ILiveTopicSource, PingLiveSource>();
        services.AddSingleton<IEndedGameReader, ReplicaEndedGameReader>();
        services.AddSingleton<ILiveTopicSource, GameLiveSource>();
        services.AddSingleton<ILiveTopicSource, QueueLiveSource>();
        services.AddSingleton<ILiveTopicSource, InviteLiveSource>();
        services.AddSingleton<IGameStarter, GameStarter>();
        services.AddSingleton<LiveTopicResolver>();
        builder.AddActorSystem((akka, sp) =>
        {
            akka.WithPingSharding(sp.GetRequiredService<AkkaOptions>());
            akka.WithGameSharding(sp.GetRequiredService<AkkaOptions>());
            akka.WithMatchmaking(sp.GetRequiredService<AkkaOptions>());
            akka.WithInviteSharding(sp.GetRequiredService<AkkaOptions>());
            akka.WithDeadlineSweeper();
            if (sp.GetRequiredService<NewsOptions>().Enabled)
            {
                akka.WithNewsFetcher();
            }
            if (sp.GetRequiredService<KafkaOptions>().Enabled)
            {
                akka.WithJournalPublisher();
            }

            akka.WithClusterMetrics(
                TimeSpan.FromSeconds(sp.GetRequiredService<ObservabilityOptions>().ClusterSampleSeconds),
                publisher: sp.GetRequiredService<KafkaOptions>().Enabled);
        });

        AddJwtBearer(services, keycloak, isDevelopment);
        services.AddAuthorization(o => o.AddPolicy(Constants.Policies.SignedIn, p => p.RequireAuthenticatedUser()));
        AddCors(services, configuration);
        services.AddRateLimiting(redis, configuration.GetSection(RateLimitOptions.SectionName).Get<RateLimitOptions>());
        return builder;
    }

    /// <summary>
    /// FusionCache with an in-memory L1 always; when <c>ConnectionStrings:Redis</c> is set, Redis becomes the L2
    /// and the backplane, so every instance sees the same <c>user-id:*</c> / discovery entries and evictions.
    /// Without Redis (unit tests, a bare dev run) the cache is L1-only and nothing else changes.
    /// </summary>
    internal static IServiceCollection AddCaching(this IServiceCollection services, string? redisConnectionString, CacheOptions? options = null)
    {
        TimeSpan duration = TimeSpan.FromMinutes((options ?? new CacheOptions()).DefaultMinutes);
        IFusionCacheBuilder cache = services.AddFusionCache()
            .WithDefaultEntryOptions(o => o.Duration = duration);
        if (string.IsNullOrEmpty(redisConnectionString))
        {
            return services;
        }

        services.AddSingleton<IConnectionMultiplexer>(_ =>
        {
            ConfigurationOptions options = ConfigurationOptions.Parse(redisConnectionString);
            // Boot even if Redis is briefly down; StackExchange.Redis reconnects in the background.
            options.AbortOnConnectFail = false;
            return ConnectionMultiplexer.Connect(options);
        });
        services.AddStackExchangeRedisCache(o => o.Configuration = redisConnectionString);
        cache
            .WithSerializer(new ZiggyCreatures.Caching.Fusion.Serialization.SystemTextJson.FusionCacheSystemTextJsonSerializer())
            .WithRegisteredDistributedCache()
            .WithStackExchangeRedisBackplane(o => o.Configuration = redisConnectionString);
        return services;
    }

    /// <summary>
    /// Empty <c>Kafka:BootstrapServers</c> ⇒ no consumer host and no journal publisher (events stay in the journal).
    /// Non-empty ⇒ one Akka.Streams.Kafka consumer per registered <see cref="IProjection"/>, plus the services the
    /// journal publisher singleton needs (lease on the PRIMARY, event mappers).
    /// </summary>
    internal static IServiceCollection AddMessaging(this IServiceCollection services, IConfiguration configuration)
    {
        KafkaOptions kafka = services.AddSettings<KafkaOptions>(configuration, KafkaOptions.SectionName);
        services.AddSettings<ProjectionDeadLetterOptions>(configuration, ProjectionDeadLetterOptions.SectionName);
        services.AddSettings<JournalPublisherOptions>(configuration, JournalPublisherOptions.SectionName);
        // Registered twice on purpose: KafkaConsumerHost discovers projections through IProjection but
        // then re-resolves each one by its CONCRETE type in a fresh scope per batch, which an
        // interface-only registration cannot serve.
        services.AddScoped<PingProjection>();
        services.AddScoped<IProjection>(sp => sp.GetRequiredService<PingProjection>());
        services.AddScoped<GameProjection>();
        services.AddScoped<IProjection>(sp => sp.GetRequiredService<GameProjection>());
        // Games against the engine (engine-play D6): one consumer asks for moves, the other applies the answers.
        EngineOptions engine = services.AddSettings<EngineOptions>(configuration, EngineOptions.SectionName);
        services.AddSettings<CorrespondenceOptions>(configuration, CorrespondenceOptions.SectionName);
        // Chess news (chess-news): one HTTP client for every feed (redirects followed: FIDE moved its feed to /feed/).
        services.AddSettings<NewsOptions>(configuration, NewsOptions.SectionName);
        services.AddHttpClient(NewsRounds.HttpClientName);
        services.AddSingleton<INewsRounds, NewsRounds>();
        // Correspondence deadlines (correspondence-games D3): the projection fills game_deadlines, the sweeper reads it.
        services.AddScoped<DeadlineProjection>();
        services.AddScoped<IProjection>(sp => sp.GetRequiredService<DeadlineProjection>());
        services.AddSingleton<IDueDeadlines, DueDeadlines>();
        // Mail for correspondence games (correspondence-games D4): SMTP when Smtp:Host is set, otherwise only logged.
        SmtpOptions smtp = services.AddSettings<SmtpOptions>(configuration, SmtpOptions.SectionName);
        if (smtp.Enabled)
        {
            services.AddSingleton<IMailer>(new SmtpMailer(smtp));
        }
        else
        {
            services.AddSingleton<IMailer, LogMailer>();
        }

        services.AddScoped<NotificationConsumer>();
        services.AddScoped<IProjection>(sp => sp.GetRequiredService<NotificationConsumer>());
        // Shared position analysis (engine-analysis): requests to the engine worker, results into the cache.
        services.AddSettings<AnalysisOptions>(configuration, AnalysisOptions.SectionName);
        services.AddScoped<AnalysisResultConsumer>();
        services.AddScoped<IProjection>(sp => sp.GetRequiredService<AnalysisResultConsumer>());
        if (kafka.Enabled)
        {
            services.AddSingleton<IAnalysisRequests>(_ => new KafkaAnalysisRequests(kafka.BootstrapServers));
        }
        else
        {
            services.AddSingleton<IAnalysisRequests>(NoAnalysisRequests.Instance);
        }
        services.AddScoped<EngineRequestConsumer>();
        services.AddScoped<IProjection>(sp => sp.GetRequiredService<EngineRequestConsumer>());
        services.AddScoped<EngineMoveConsumer>();
        services.AddScoped<IProjection>(sp => sp.GetRequiredService<EngineMoveConsumer>());
        if (!kafka.Enabled)
        {
            services.AddSingleton<IEngineRequests>(NoEngineRequests.Instance);
        }
        else
        {
            services.AddSingleton<IEngineRequests>(sp => KafkaEngineRequests.Create(
                kafka.BootstrapServers, engine, sp.GetRequiredService<TimeProvider>(), sp.GetRequiredService<ILogger<KafkaEngineRequests>>()));
            services.AddHostedService<KafkaConsumerHost>();
            services.AddSingleton<ProjectionRunner>();
            services.AddSingleton<IJournalEventMapper, PingedJournalMapper>();
            foreach (IJournalEventMapper mapper in GameJournalMappers.All())
            {
                services.AddSingleton(mapper);
            }
            services.AddSingleton<JournalEventMappers>();
            services.AddSingleton<IPublisherLeaseProvider>(_ => new PostgresPublisherLeaseProvider(
                configuration.GetConnectionString(Constants.ConnectionStrings.Postgres) is { Length: > 0 } primary
                    ? primary
                    : throw new InvalidOperationException("ConnectionStrings:Postgres is required for the journal publisher.")));
        }

        return services;
    }

    private static void AddJwtBearer(IServiceCollection services, KeycloakOptions keycloak, bool isDevelopment) =>
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options => ConfigureJwtBearer(options, keycloak, isDevelopment));

    /// <summary>
    /// Issuer is always validated. Audience is validated whenever <c>Keycloak:Audience</c> is set, which every deployed
    /// environment does (<c>chess_api</c>); only the IntegrationTest environment, which swaps in a test scheme, leaves it
    /// empty. Without it any token from the realm would do, whichever client it was issued to.
    /// </summary>
    internal static void ConfigureJwtBearer(JwtBearerOptions options, KeycloakOptions keycloak, bool isDevelopment)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(keycloak);
        options.Authority = keycloak.Authority;
        options.RequireHttpsMetadata = !isDevelopment;
        options.MapInboundClaims = false;
        bool hasAudience = !string.IsNullOrEmpty(keycloak.Audience);
        options.Audience = hasAudience ? keycloak.Audience : null;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            NameClaimType = Constants.Claims.Subject,
            RoleClaimType = ClaimTypes.Role,
            ValidateAudience = hasAudience,
            ValidateIssuer = true,
            ValidIssuer = keycloak.Authority,
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = CookieBearerTokenResolver.OnMessageReceivedAsync,
        };
    }

    private static void AddCors(IServiceCollection services, ConfigurationManager configuration)
    {
        string[] origins = configuration.GetSection(Constants.ConfigKeys.AllowedCorsOrigins).Get<string[]>() ?? [];
        services.AddCors(options => options.AddPolicy(Constants.CorsPolicy, policy => policy
            .WithOrigins(origins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()));
    }

    /// <summary>
    /// <see cref="RateLimitOptions.PermitLimit"/> requests per <see cref="RateLimitOptions.WindowSeconds"/> per signed-in
    /// user, or per client IP for anonymous calls (<see cref="ClientKey"/>; section <c>RateLimit</c>). With Redis the counters are shared across instances (one limit per client, however
    /// many replicas run); without it each instance counts on its own.
    /// </summary>
    internal static IServiceCollection AddRateLimiting(this IServiceCollection services, string? redisConnectionString, RateLimitOptions? limits = null)
    {
        RateLimitOptions options = limits ?? new RateLimitOptions();
        options.Validate();
        int permits = options.PermitLimit;
        TimeSpan window = TimeSpan.FromSeconds(options.WindowSeconds);
        bool distributed = !string.IsNullOrEmpty(redisConnectionString);
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.GlobalLimiter = distributed
                ? PartitionedRateLimiter.Create<HttpContext, string>(http =>
                    RedisRateLimitPartition.GetFixedWindowRateLimiter(
                        ClientKey(http),
                        _ => new RedisFixedWindowRateLimiterOptions
                        {
                            ConnectionMultiplexerFactory = () => http.RequestServices.GetRequiredService<IConnectionMultiplexer>(),
                            PermitLimit = permits,
                            Window = window,
                        }))
                : PartitionedRateLimiter.Create<HttpContext, string>(http =>
                    RateLimitPartition.GetFixedWindowLimiter(
                        ClientKey(http),
                        _ => new FixedWindowRateLimiterOptions
                        {
                            PermitLimit = permits,
                            Window = window,
                            QueueLimit = 0,
                        }));
        });
        return services;
    }

    /// <summary>
    /// The signed-in user when authentication vouched for one, otherwise the client address: everyone the BFF serves
    /// arrives from the BFF's address (the real one only in <c>X-Forwarded-For</c>), and many people share one address
    /// behind CGNAT. Runs after <c>UseAuthentication</c>; a forged or expired cookie leaves an unauthenticated user and
    /// so counts against its address, never against a fresh bucket of its own.
    /// </summary>
    internal static string ClientKey(HttpContext http)
    {
        ArgumentNullException.ThrowIfNull(http);
        if (http.User.Identity?.IsAuthenticated == true
            && http.User.FindFirstValue(Constants.Claims.Subject) is { Length: > 0 } subject)
        {
            return $"user:{subject}";
        }

        return http.Connection.RemoteIpAddress is { } address ? $"ip:{address}" : "anonymous";
    }

    /// <summary>Registers every <c>Xxx : BaseService, IXxx</c> as scoped under each of its <see cref="IService"/> interfaces.</summary>
    internal static IServiceCollection AddConventionServices(this IServiceCollection services)
    {
        IEnumerable<Type> implementations = typeof(BaseService).Assembly.GetTypes()
            .Where(t => t is { IsAbstract: false, IsClass: true } && typeof(BaseService).IsAssignableFrom(t));
        foreach (Type implementation in implementations)
        {
            foreach (Type contract in implementation.GetInterfaces()
                         .Where(i => i != typeof(IService) && typeof(IService).IsAssignableFrom(i)))
            {
                services.AddScoped(contract, implementation);
            }
        }

        return services;
    }
}

internal static class SharedConfigurationExtensions
{
    /// <summary>Config lives under <c>Config/</c> (kept out of the repo root); env vars override as usual.</summary>
    public static WebApplicationBuilder AddSharedConfiguration(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        string configDir = Path.Combine(builder.Environment.ContentRootPath, "Config");
        builder.Configuration
            .AddJsonFile(Path.Combine(configDir, "appsettings.json"), optional: false, reloadOnChange: true)
            .AddJsonFile(
                Path.Combine(configDir, $"appsettings.{builder.Environment.EnvironmentName}.json"),
                optional: true,
                reloadOnChange: true)
            .AddEnvironmentVariables();

        // The first host reconfigures the bootstrap logger; any further in-process host (the integration tests'
        // factories) keeps a logger of its own, since a bootstrap logger can be frozen only once.
        builder.Host.UseSerilog(
            (context, services, config) => config
                .ReadFrom.Configuration(context.Configuration)
                .ReadFrom.Services(services)
                .Enrich.FromLogContext()
                .ConfigureOtlpLogs(context.Configuration),
            preserveStaticLogger: !StartupLogging.ClaimBootstrapLogger());

        return builder;
    }
}

/// <summary>
/// Section <c>Observability</c> (observability D2): whether this node exports traces, metrics and logs over OTLP, to
/// where, and how many traces it keeps. Off by default, so tests and a bare <c>dotnet run</c> export nothing; the
/// local stack turns it on.
/// </summary>
internal sealed class ObservabilityOptions : ISettings
{
    public const string SectionName = "Observability";

    public bool Enabled { get; set; }

    /// <summary>The collector's OTLP gRPC endpoint.</summary>
    public string OtlpEndpoint { get; set; } = "http://otel-collector:4317";

    /// <summary>
    /// The share of traces kept where they start (parent-based: a trace is decided once, and every hop follows).
    /// 1.0 locally; production turns it down, or samples by tail in the collector (observability D12).
    /// </summary>
    public double SampleRatio { get; set; } = 1.0;

    /// <summary>The <c>deployment.environment</c> every signal carries.</summary>
    public string Environment { get; set; } = "local";

    /// <summary>How often metrics are pushed; the same as Prometheus's scrape interval, so dashboards move together.</summary>
    public int MetricExportSeconds { get; set; } = 15;

    /// <summary>How often each node samples the cluster and its shard regions for the Actors &amp; cluster gauges.</summary>
    public int ClusterSampleSeconds { get; set; } = 10;

    public void Validate()
    {
        if (SampleRatio is < 0 or > 1)
        {
            throw new InvalidOperationException("Observability:SampleRatio must be between 0 and 1.");
        }

        if (MetricExportSeconds <= 0 || ClusterSampleSeconds <= 0)
        {
            throw new InvalidOperationException("Observability:MetricExportSeconds and Observability:ClusterSampleSeconds must be positive.");
        }

        if (Enabled && !Uri.TryCreate(OtlpEndpoint, UriKind.Absolute, out _))
        {
            throw new InvalidOperationException("Observability:OtlpEndpoint must be an absolute URI when Observability:Enabled.");
        }
    }
}

internal static class ObservabilityExtensions
{
    /// <summary>
    /// Traces (HTTP in, Npgsql, HTTP out, the actors) and metrics (ASP.NET Core, Kestrel, SignalR, HttpClient, Npgsql,
    /// the .NET runtime, our <c>chess.*</c> meters) over OTLP, when <c>Observability:Enabled</c>. Logs go through
    /// Serilog's OTLP sink (<see cref="ConfigureOtlpLogs"/>), so they carry the trace they were written in. Off, nothing
    /// is registered: no listener exists, and every span start is a null.
    /// </summary>
    public static IServiceCollection AddObservability(this IServiceCollection services, IConfiguration configuration, string node)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        ObservabilityOptions options = services.AddSettings<ObservabilityOptions>(configuration, ObservabilityOptions.SectionName);
        if (!options.Enabled)
        {
            return services;
        }

        Uri endpoint = new(options.OtlpEndpoint);
        services.AddOpenTelemetry()
            .ConfigureResource(resource => resource.AddAttributes(ResourceAttributes(options, node)))
            .WithTracing(tracing =>
            {
                tracing
                    .SetSampler(new ParentBasedSampler(new TraceIdRatioBasedSampler(options.SampleRatio)))
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddNpgsql()
                    .AddSource(ActorTracing.SourceName, PipelineTracing.SourceName, "Microsoft.AspNetCore.SignalR.Server")
                    .AddOtlpExporter(o => o.Endpoint = endpoint);
                if (ProfilerLoaded)
                {
                    // Span profiles (observability D10): profile samples carry the span, so Grafana opens one span's flame graph.
                    tracing.AddProcessor(new Pyroscope.OpenTelemetry.PyroscopeSpanProcessor());
                }
            })
            // .NET publishes these meters itself; subscribing by name is all it takes.
            .WithMetrics(metrics => metrics
                .AddMeter(
                    "Microsoft.AspNetCore.Hosting",
                    "Microsoft.AspNetCore.Server.Kestrel",
                    "Microsoft.AspNetCore.Http.Connections",
                    "Microsoft.AspNetCore.SignalR",
                    "Microsoft.AspNetCore.RateLimiting",
                    "System.Net.Http",
                    "System.Runtime",
                    "Npgsql",
                    "chess.*")
                .AddOtlpExporter((exporter, reader) =>
                {
                    exporter.Endpoint = endpoint;
                    reader.PeriodicExportingMetricReaderOptions.ExportIntervalMilliseconds = options.MetricExportSeconds * 1000;
                }));

        return services;
    }

    /// <summary>Pyroscope's native profiler is in this process (the stack's compose variables load it); span profiles need it.</summary>
    public static bool ProfilerLoaded => System.Environment.GetEnvironmentVariable("PYROSCOPE_PROFILING_ENABLED") == "1"
        && System.Environment.GetEnvironmentVariable("CORECLR_ENABLE_PROFILING") == "1";

    /// <summary>Who is speaking: the app, this node (the Akka hostname in the cluster), and the environment.</summary>
    public static IReadOnlyDictionary<string, object> ResourceAttributes(ObservabilityOptions options, string node)
    {
        ArgumentNullException.ThrowIfNull(options);
        return new Dictionary<string, object>(StringComparer.Ordinal)
        {
            ["service.name"] = Constants.ServiceName,
            ["service.instance.id"] = node,
            ["deployment.environment"] = options.Environment,
        };
    }

    /// <summary>This node's name for telemetry: its Akka hostname in the cluster, else the machine name.</summary>
    public static string NodeName(IConfiguration configuration) =>
        configuration[Constants.ConfigKeys.AkkaHostname] is { Length: > 0 } host ? host : System.Environment.MachineName;

    /// <summary>Adds the OTLP sink to Serilog when export is on: every log reaches Loki with its trace and span ids.</summary>
    public static LoggerConfiguration ConfigureOtlpLogs(this LoggerConfiguration logger, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(logger);
        ObservabilityOptions options = configuration.GetSection(ObservabilityOptions.SectionName).Get<ObservabilityOptions>() ?? new();
        if (!options.Enabled)
        {
            return logger;
        }

        return logger.WriteTo.OpenTelemetry(o =>
        {
            o.Endpoint = options.OtlpEndpoint;
            o.Protocol = Serilog.Sinks.OpenTelemetry.OtlpProtocol.Grpc;
            o.ResourceAttributes = new Dictionary<string, object>(ResourceAttributes(options, NodeName(configuration)));
        });
    }
}

/// <summary>The global per-client rate limit (section <c>RateLimit</c>); the defaults are the limit the API has always had.</summary>
internal sealed class RateLimitOptions : ISettings
{
    public const string SectionName = "RateLimit";

    /// <summary>Requests a client (by IP) may make per window.</summary>
    public int PermitLimit { get; set; } = 300;

    public int WindowSeconds { get; set; } = 60;

    public void Validate()
    {
        if (PermitLimit <= 0 || WindowSeconds <= 0)
        {
            throw new InvalidOperationException("RateLimit:PermitLimit and RateLimit:WindowSeconds must be positive.");
        }
    }
}

/// <summary>Cache lifetimes (section <c>Cache</c>); the defaults are the lifetimes the code has always used.</summary>
internal sealed class CacheOptions : ISettings
{
    public const string SectionName = "Cache";

    /// <summary>FusionCache's default entry lifetime.</summary>
    public int DefaultMinutes { get; set; } = 10;

    /// <summary>How long a Keycloak <c>sub</c> → <c>users.id</c> mapping is kept.</summary>
    public int UserIdMinutes { get; set; } = 10;

    /// <summary>How long Keycloak's OIDC discovery document is kept.</summary>
    public int OidcDiscoveryMinutes { get; set; } = 60;

    /// <summary>How long a user's display preferences are kept (evicted on save).</summary>
    public int PreferencesMinutes { get; set; } = 60;

    public void Validate()
    {
        if (DefaultMinutes <= 0 || UserIdMinutes <= 0 || OidcDiscoveryMinutes <= 0 || PreferencesMinutes <= 0)
        {
            throw new InvalidOperationException("Cache:DefaultMinutes, Cache:UserIdMinutes, Cache:OidcDiscoveryMinutes and Cache:PreferencesMinutes must be positive.");
        }
    }
}

/// <summary>
/// An options class bound from one configuration section. <see cref="Validate"/> throws with the setting's name, so a
/// bad value stops startup with a clear Fatal line (startup-logging-and-config).
/// </summary>
internal interface ISettings
{
    void Validate();
}

internal static class SettingsExtensions
{
    /// <summary>
    /// Binds <paramref name="section"/>, validates it at once, and registers the result as both <typeparamref name="T"/>
    /// and <c>IOptions&lt;T&gt;</c>. The one way options are registered (startup-logging-and-config D4).
    /// </summary>
    public static T AddSettings<T>(this IServiceCollection services, IConfiguration configuration, string section)
        where T : class, ISettings, new()
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);
        T settings = configuration.GetSection(section).Get<T>() ?? new T();
        settings.Validate();
        services.AddSingleton(settings);
        services.AddSingleton<IOptions<T>>(Options.Create(settings));
        return settings;
    }
}
