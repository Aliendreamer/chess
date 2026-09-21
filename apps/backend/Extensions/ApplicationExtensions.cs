using Chess.Backend.WebApi.Authentication;
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

        app.UseForwardedHeaders(new ForwardedHeadersOptions
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost,
        });
        app.UseSecurityHeaders();
        app.UseExceptionHandler(static _ => { });
        app.UseSerilogRequestLogging();
        app.UseRateLimiter();
        app.UseCors(Constants.CorsPolicy);
        app.UseAuthentication();
        app.UseAuthorization();

        app.MapHealthChecks(Constants.HealthPath);
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
}
