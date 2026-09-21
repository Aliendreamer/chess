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
        builder.Services.AddHealthChecks().AddNpgSql(connectionString, name: "postgres");
        return builder;
    }
}
