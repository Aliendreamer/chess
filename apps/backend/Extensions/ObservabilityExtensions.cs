using Chess.Backend.Akka;
using Npgsql;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace Chess.Backend.Extensions;

internal static class ObservabilityExtensions
{
    /// <summary>
    /// Tracing for the whole request path — HTTP in, Npgsql, HTTP out (Keycloak) and the actors — exported
    /// to the console. Off unless <c>Observability:Console</c> is true, so it stays a development tool
    /// until there is somewhere real to send spans (OTLP endpoint, then this gains an exporter branch).
    /// </summary>
    public static IServiceCollection AddObservability(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        if (!configuration.GetValue<bool>("Observability:Console"))
        {
            return services;
        }

        services.AddOpenTelemetry()
            .ConfigureResource(resource => resource.AddService(Constants.ServiceName))
            .WithTracing(tracing => tracing
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddNpgsql()
                .AddSource(ActorTracing.SourceName)
                .AddConsoleExporter());

        return services;
    }
}
