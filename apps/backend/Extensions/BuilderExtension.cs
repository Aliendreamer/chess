using System.Reflection;
using System.Threading.RateLimiting;
using Chess.Backend.Data.Auth;
using Chess.Backend.WebApi.Authentication;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

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
        services.AddFusionCache();
        services.AddHttpClient(Constants.KeycloakHttpClient, client => client.Timeout = TimeSpan.FromSeconds(15));
        services.AddSingleton<IKeycloakOidcClient, KeycloakOidcClient>();
        services.AddSingleton<SessionCookies>();
        services.AddScoped<CurrentUser>();
        services.AddScoped<ICurrentUser>(sp => sp.GetRequiredService<CurrentUser>());
        services.AddSingleton<IClaimsTransformation, KeycloakRolesClaimsTransformation>();
        services.AddHostedService<SessionCleanupService>();
        services.AddConventionServices();

        AddJwtBearer(services, configuration.GetSection(KeycloakOptions.SectionName).Get<KeycloakOptions>() ?? new(), isDevelopment);
        services.AddAuthorization();
        AddCors(services, configuration);
        AddRateLimiting(services);
        return builder;
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

    private static void AddRateLimiting(IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(http =>
                RateLimitPartition.GetFixedWindowLimiter(
                    http.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 300,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0,
                    }));
        });
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
