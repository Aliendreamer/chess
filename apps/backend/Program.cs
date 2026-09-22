using Chess.Backend.Extensions;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder
    .AddSharedConfiguration()
    .AddDatabaseContext()
    .AddReadDatabaseContext()
    .AddCommonServices()
    .AddEndpoints();

WebApplication app = builder.Build();
app.UseRequestPipeline();
await app.MigrateAndSeedDbAsync();
await app.RunAsync();
