using System.Reflection;
using System.Threading.RateLimiting;
using Chess.Backend.Akka;
using Chess.Backend.Akka.Ping;
using Chess.Backend.Data.Auth;
using Chess.Backend.Messaging;
using Chess.Backend.Projections;
using Chess.Backend.WebApi.Authentication;
using Confluent.Kafka;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using RedisRateLimiting;
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

        services.Configure<KeycloakOptions>(configuration.GetSection(KeycloakOptions.SectionName));
        services.Configure<SessionCookieOptions>(configuration.GetSection(SessionCookieOptions.SectionName));
        services.Configure<SessionStoreOptions>(configuration.GetSection(SessionStoreOptions.SectionName));

        services.AddSingleton(TimeProvider.System);
        string? redis = configuration.GetConnectionString("Redis");
        services.AddCaching(redis);
        services.AddHttpClient(Constants.KeycloakHttpClient, client => client.Timeout = TimeSpan.FromSeconds(15));
        services.AddSingleton<IKeycloakOidcClient, KeycloakOidcClient>();
        services.AddSingleton<SessionCookies>();
        services.AddScoped<CurrentUser>();
        services.AddScoped<ICurrentUser>(sp => sp.GetRequiredService<CurrentUser>());
        services.AddSingleton<IClaimsTransformation, KeycloakRolesClaimsTransformation>();
        services.AddHostedService<SessionCleanupService>();
        services.AddConventionServices();
        services.AddObservability(configuration);
        AddMessaging(services, configuration);
        services.AddSignalR();
        builder.AddActorSystem((akka, sp) => akka.WithPingSharding(sp.GetRequiredService<AkkaOptions>()));

        AddJwtBearer(services, configuration.GetSection(KeycloakOptions.SectionName).Get<KeycloakOptions>() ?? new(), isDevelopment);
        services.AddAuthorization();
        AddCors(services, configuration);
        services.AddRateLimiting(redis);
        return builder;
    }

    /// <summary>
    /// FusionCache with an in-memory L1 always; when <c>ConnectionStrings:Redis</c> is set, Redis becomes the L2
    /// and the backplane, so every instance sees the same <c>user-id:*</c> / discovery entries and evictions.
    /// Without Redis (unit tests, a bare dev run) the cache is L1-only and nothing else changes.
    /// </summary>
    internal static IServiceCollection AddCaching(this IServiceCollection services, string? redisConnectionString)
    {
        IFusionCacheBuilder cache = services.AddFusionCache()
            .WithDefaultEntryOptions(o => o.Duration = TimeSpan.FromMinutes(10));
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
    /// Empty <c>Kafka:BootstrapServers</c> ⇒ NullEventPublisher, no consumer host. Non-empty ⇒ the real Confluent
    /// producer plus one Akka.Streams.Kafka consumer per registered <see cref="IProjection"/>.
    /// </summary>
    internal static IServiceCollection AddMessaging(this IServiceCollection services, IConfiguration configuration)
    {
        KafkaOptions kafka = configuration.GetSection(KafkaOptions.SectionName).Get<KafkaOptions>() ?? new KafkaOptions();
        services.AddSingleton(kafka);
        // Registered twice on purpose: KafkaConsumerHost discovers projections through IProjection but
        // then re-resolves each one by its CONCRETE type in a fresh scope per batch, which an
        // interface-only registration cannot serve.
        services.AddScoped<PingProjection>();
        services.AddScoped<IProjection>(sp => sp.GetRequiredService<PingProjection>());
        if (kafka.Enabled)
        {
            services.AddSingleton(_ => KafkaEventPublisher.CreateProducer(kafka));
            services.AddSingleton<IEventPublisher>(sp => new KafkaEventPublisher(sp.GetRequiredService<IProducer<string, string>>()));
            services.AddHostedService<KafkaConsumerHost>();
        }
        else
        {
            services.AddSingleton<IEventPublisher, NullEventPublisher>();
        }

        return services;
    }

    private static void AddJwtBearer(IServiceCollection services, KeycloakOptions keycloak, bool isDevelopment)
    {
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
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
            });
    }

    private static void AddCors(IServiceCollection services, ConfigurationManager configuration)
    {
        string[] origins = configuration.GetSection("AllowedCorsOrigins").Get<string[]>() ?? [];
        services.AddCors(options => options.AddPolicy(Constants.CorsPolicy, policy => policy
            .WithOrigins(origins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()));
    }

    private const int RateLimitPermits = 300;
    private static readonly TimeSpan RateLimitWindow = TimeSpan.FromMinutes(1);

    /// <summary>
    /// 300 requests/minute per client IP. With Redis the counters are shared across instances (one limit per
    /// client, however many replicas run); without it each instance counts on its own.
    /// </summary>
    internal static IServiceCollection AddRateLimiting(this IServiceCollection services, string? redisConnectionString)
    {
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
                            PermitLimit = RateLimitPermits,
                            Window = RateLimitWindow,
                        }))
                : PartitionedRateLimiter.Create<HttpContext, string>(http =>
                    RateLimitPartition.GetFixedWindowLimiter(
                        ClientKey(http),
                        _ => new FixedWindowRateLimiterOptions
                        {
                            PermitLimit = RateLimitPermits,
                            Window = RateLimitWindow,
                            QueueLimit = 0,
                        }));
        });
        return services;
    }

    internal static string ClientKey(HttpContext http)
    {
        ArgumentNullException.ThrowIfNull(http);
        return http.Connection.RemoteIpAddress?.ToString() ?? "anonymous";
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
