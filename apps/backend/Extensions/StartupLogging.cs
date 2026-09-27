using System.Diagnostics;
using Chess.Backend.Akka;
using Npgsql;
using Serilog;
using Serilog.Formatting.Compact;

namespace Chess.Backend.Extensions;

/// <summary>
/// Logging before the host exists (startup-logging-and-config D1): a bootstrap logger on the console, in the same
/// compact JSON as the configured one, so a failure while building the host is still reported. The first host adopts
/// and reconfigures it; later in-process hosts (the integration tests' factories) keep their own logger instead,
/// because a bootstrap logger can be frozen only once per process.
/// </summary>
internal static class StartupLogging
{
    private static int BootstrapCreated;
    private static int BootstrapClaimed;

    public static void CreateBootstrapLogger()
    {
        if (Interlocked.Exchange(ref BootstrapCreated, 1) == 1)
        {
            return;
        }

        Serilog.Log.Logger = new LoggerConfiguration()
            .Enrich.FromLogContext()
            .WriteTo.Console(new CompactJsonFormatter())
            .CreateBootstrapLogger();
    }

    /// <summary>True for exactly one host per process: the one that reconfigures the static bootstrap logger.</summary>
    public static bool ClaimBootstrapLogger() => Interlocked.Exchange(ref BootstrapClaimed, 1) == 0;
}

/// <summary>
/// Names each startup step as it begins and ends (with its duration), so a failure can say which step it was in
/// (startup-logging-and-config D2).
/// </summary>
internal sealed class StartupSteps
{
    private readonly Stopwatch _total = Stopwatch.StartNew();

    /// <summary>The step running now; the Fatal line names it.</summary>
    public string Current { get; private set; } = "start";

    public bool Completed { get; private set; }

    public T Run<T>(string step, Func<T> action)
    {
        ArgumentNullException.ThrowIfNull(action);
        Stopwatch watch = Begin(step);
        T result = action();
        End(step, watch);
        return result;
    }

    public void Run(string step, Action action)
    {
        ArgumentNullException.ThrowIfNull(action);
        Stopwatch watch = Begin(step);
        action();
        End(step, watch);
    }

    public async Task RunAsync(string step, Func<Task> action)
    {
        ArgumentNullException.ThrowIfNull(action);
        Stopwatch watch = Begin(step);
        await action();
        End(step, watch);
    }

    /// <summary>The host is listening: the last startup line.</summary>
    public void Complete(IEnumerable<string> urls)
    {
        Completed = true;
        Current = "running";
        Serilog.Log.Information("Startup complete in {ElapsedMs} ms, listening on {Urls}", _total.ElapsedMilliseconds, string.Join(", ", urls));
    }

    private Stopwatch Begin(string step)
    {
        Current = step;
        Serilog.Log.Information("Startup step {Step}", step);
        return Stopwatch.StartNew();
    }

    private static void End(string step, Stopwatch watch) =>
        Serilog.Log.Information("Startup step {Step} done in {ElapsedMs} ms", step, watch.ElapsedMilliseconds);
}

/// <summary>
/// The settings that explain how a node behaves, for one startup log event (startup-logging-and-config D3). Pure over
/// <see cref="IConfiguration"/>: connection strings shrink to host, port and database, Redis to on/off, and no secret
/// key is ever read.
/// </summary>
internal static class StartupSummary
{
    public static IReadOnlyDictionary<string, string> Describe(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        AkkaOptions akka = configuration.GetSection(AkkaOptions.SectionName).Get<AkkaOptions>() ?? new AkkaOptions();
        RateLimitOptions rate = configuration.GetSection(RateLimitOptions.SectionName).Get<RateLimitOptions>() ?? new RateLimitOptions();
        string kafka = configuration["Kafka:BootstrapServers"] ?? string.Empty;
        string authority = configuration["Keycloak:Authority"] ?? string.Empty;
        string audience = configuration["Keycloak:Audience"] ?? string.Empty;

        return new Dictionary<string, string>
        {
            ["Akka"] = $"{akka.Hostname}:{akka.Port}",
            ["AkkaSeeds"] = akka.SeedNodes.Length == 0 ? "(self)" : string.Join(", ", akka.SeedNodes),
            ["AkkaRoles"] = string.Join(", ", akka.Roles),
            ["Kafka"] = string.IsNullOrWhiteSpace(kafka) ? "off" : kafka,
            ["Redis"] = string.IsNullOrWhiteSpace(configuration.GetConnectionString("Redis")) ? "off" : "on",
            ["Postgres"] = Database(configuration.GetConnectionString("Postgres")),
            ["PostgresReplica"] = Database(configuration.GetConnectionString("PostgresReplica")),
            ["Keycloak"] = string.IsNullOrWhiteSpace(authority) ? "(not set)" : $"{authority} (audience {(audience.Length == 0 ? "none" : audience)})",
            ["RateLimit"] = $"{rate.PermitLimit} per {rate.WindowSeconds} s",
            ["Presence"] = $"abandon after {akka.AbandonAfterSeconds} s, lease {akka.PresenceLeaseSeconds} s",
        };
    }

    /// <summary>Logs the summary as one event with a property per setting.</summary>
    public static void Log(IConfiguration configuration, string environment)
    {
        IReadOnlyDictionary<string, string> summary = Describe(configuration);
        Serilog.Log.Information("Starting {Service} in {Environment} with {@Settings}", Constants.ServiceName, environment, summary);
    }

    /// <summary><c>host:port/database</c> only — the password and every other key stay out.</summary>
    private static string Database(string? connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return "(not set)";
        }

        try
        {
            NpgsqlConnectionStringBuilder parsed = new(connectionString);
            return $"{parsed.Host}:{parsed.Port}/{parsed.Database}";
        }
        catch (ArgumentException)
        {
            return "(unparseable)";
        }
    }
}
