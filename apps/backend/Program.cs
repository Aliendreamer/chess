using Chess.Backend.Extensions;

// Logging exists before anything else can fail (startup-logging-and-config D1): a bad setting, a DI error, an
// unreachable database or a cluster problem is reported as "Startup failed at {Step}" instead of a silent exit.
StartupLogging.CreateBootstrapLogger();
StartupSteps steps = new();
try
{
    WebApplicationBuilder builder = steps.Run("configuration", () => WebApplication.CreateBuilder(args).AddSharedConfiguration());
    StartupSummary.Log(builder.Configuration, builder.Environment.EnvironmentName);
    steps.Run("database", () => builder.AddDatabaseContext());
    steps.Run("read replica", () => builder.AddReadDatabaseContext());
    steps.Run("services", () => builder.AddCommonServices());
    steps.Run("endpoints", () => builder.AddEndpoints());

    WebApplication app = steps.Run("host build", builder.Build);
    steps.Run("request pipeline", () => app.UseRequestPipeline());
    await steps.RunAsync("migrations", () => app.MigrateAndSeedDbAsync());
    app.Lifetime.ApplicationStarted.Register(() => steps.Complete(app.Urls));
    await app.RunAsync();
    Serilog.Log.Information("Stopped");
    await Serilog.Log.CloseAndFlushAsync();
    return 0;
}
catch (HostAbortedException)
{
    throw; // EF tooling and the in-process test hosts stop the entry point on purpose
}
#pragma warning disable CA1031 // the last line of defence: whatever went wrong, say where and exit non-zero
catch (Exception ex)
#pragma warning restore CA1031
{
    if (steps.Completed)
    {
        Serilog.Log.Fatal(ex, "The host stopped unexpectedly");
    }
    else
    {
        Serilog.Log.Fatal(ex, "Startup failed at {Step}", steps.Current);
    }

    await Serilog.Log.CloseAndFlushAsync();
    return 1;
}
