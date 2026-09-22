using Chess.Backend.WebApi.Authentication;
using Chess.Backend.WebApi.Hubs;
using FastEndpoints.Swagger;
using Microsoft.AspNetCore.HttpOverrides;
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
        app.UseRateLimiter();
        app.UseCors(Constants.CorsPolicy);
        app.UseAuthentication();
        app.UseAuthorization();

        app.MapHealthChecks(Constants.HealthPath);
        app.MapHub<PingsHub>(PingsHub.Path).RequireCors(Constants.CorsPolicy);
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
        IConfigurationSection section = configuration.GetSection("ForwardedHeaders");
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
