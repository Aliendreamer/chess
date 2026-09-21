namespace Chess.Backend.Extensions;

internal static class DatabaseExtensions
{
    public static WebApplicationBuilder AddDatabaseContext(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        string connectionString = builder.Configuration.GetConnectionString("Postgres")
            ?? throw new InvalidOperationException("ConnectionStrings:Postgres is not configured.");

        builder.Services.AddSingleton<AuditInterceptor>();
        builder.Services.AddDbContext<ProjectDbContext>((sp, options) => options
            .UseNpgsql(connectionString, npgsql => npgsql.EnableRetryOnFailure())
            .AddInterceptors(sp.GetRequiredService<AuditInterceptor>()));
        return builder;
    }

    /// <summary>Applies pending migrations then seeds. Run once at startup, before serving traffic.</summary>
    public static async Task MigrateAndSeedDbAsync(this WebApplication app, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(app);
        using IServiceScope scope = app.Services.CreateScope();
        ProjectDbContext context = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
        await context.Database.MigrateAsync(ct);
        await SeedData.SeedAsync(context, ct);
    }
}
