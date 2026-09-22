using System.Globalization;
using System.Net;
using System.Net.Sockets;
using Testcontainers.PostgreSql;
using Testcontainers.Redpanda;

namespace Chess.Backend.IntegrationTests.Fixtures;

/// <summary>
/// The containers the spine needs: one Postgres (primary — and, for these tests, also the "replica", since
/// streaming replication itself is covered by <c>tools/localdev/verify-stack.sh</c> and a second container
/// would only slow the suite down) and one Redpanda. Shared by every test in the class so the second test
/// can restart the app against the same journal.
/// </summary>
public sealed class StackFixture : IAsyncLifetime
{
    /// <summary>
    /// Every class using the stack joins this collection: the fixture sets process-wide env vars, so two
    /// instances running in parallel would point one app at the other's containers.
    /// </summary>
    public const string Collection = "stack";

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18")
        .WithDatabase("chess")
        .WithUsername("chess")
        .WithPassword("chess")
        .Build();

    private readonly RedpandaContainer _redpanda =
        new RedpandaBuilder("docker.redpanda.com/redpandadata/redpanda:v24.3.6").Build();

    public string PostgresConnectionString => _postgres.GetConnectionString();

    /// <summary>Freezes the broker (docker pause): connections hang rather than refuse, like a real outage.</summary>
    public Task PauseKafkaAsync() => _redpanda.PauseAsync();

    public Task UnpauseKafkaAsync() => _redpanda.UnpauseAsync();

    public string BootstrapServers => _redpanda.GetBootstrapAddress().Replace("PLAINTEXT://", string.Empty, StringComparison.Ordinal);

    /// <summary>
    /// Akka remoting needs a real port before the system starts: the node seeds itself at
    /// <c>akka.tcp://chess@host:port</c>, so port 0 would seed an address nothing can join.
    /// </summary>
    public int AkkaPort { get; } = FreeTcpPort();

    /// <summary>
    /// Environment variables, not <c>UseSetting</c>: <c>AddSharedConfiguration</c> appends
    /// <c>Config/appsettings*.json</c> and then <c>AddEnvironmentVariables()</c> on top of the host
    /// configuration, so anything set through the web host builder is overwritten by the json files.
    /// Env vars are the app's last source and therefore the only override that survives.
    /// </summary>
    private static readonly string[] OwnedVariables =
    [
        "ConnectionStrings__Postgres",
        "ConnectionStrings__PostgresReplica",
        "Kafka__BootstrapServers",
        "Akka__Hostname",
        "Akka__Port",
    ];

    public async Task InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _redpanda.StartAsync());

        Environment.SetEnvironmentVariable("ConnectionStrings__Postgres", PostgresConnectionString);
        Environment.SetEnvironmentVariable("ConnectionStrings__PostgresReplica", PostgresConnectionString);
        Environment.SetEnvironmentVariable("Kafka__BootstrapServers", BootstrapServers);
        Environment.SetEnvironmentVariable("Akka__Hostname", "127.0.0.1");
        Environment.SetEnvironmentVariable("Akka__Port", AkkaPort.ToString(CultureInfo.InvariantCulture));
    }

    public async Task DisposeAsync()
    {
        foreach (string variable in OwnedVariables)
        {
            Environment.SetEnvironmentVariable(variable, null);
        }

        await _postgres.DisposeAsync();
        await _redpanda.DisposeAsync();
    }

    private static int FreeTcpPort()
    {
        using TcpListener listener = new(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }
}

[CollectionDefinition(StackFixture.Collection)]
public sealed class StackCollection : ICollectionFixture<StackFixture>;
