using Serilog;

namespace Chess.Backend.Extensions;

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

        builder.Host.UseSerilog((context, services, config) => config
            .ReadFrom.Configuration(context.Configuration)
            .ReadFrom.Services(services)
            .Enrich.FromLogContext());

        return builder;
    }
}
