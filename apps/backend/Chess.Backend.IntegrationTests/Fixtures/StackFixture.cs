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
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18")
        .WithDatabase("chess")
        .WithUsername("chess")
        .WithPassword("chess")
        .Build();

    private readonly RedpandaContainer _redpanda =
        new RedpandaBuilder("docker.redpanda.com/redpandadata/redpanda:v24.3.6").Build();

    public string PostgresConnectionString => _postgres.GetConnectionString();

    public string BootstrapServers => _redpanda.GetBootstrapAddress().Replace("PLAINTEXT://", string.Empty, StringComparison.Ordinal);

    /// <summary>
    /// Akka remoting needs a real port before the system starts: the node seeds itself at
    /// <c>akka.tcp://chess@host:port</c>, so port 0 would seed an address nothing can join.
    /// </summary>
    public int AkkaPort { get; } = FreeTcpPort();

    public Task InitializeAsync() => Task.WhenAll(_postgres.StartAsync(), _redpanda.StartAsync());

    public async Task DisposeAsync()
    {
        await _postgres.DisposeAsync();
        await _redpanda.DisposeAsync();
    }

    private static int FreeTcpPort()
    {
        using TcpListener listener = new(System.Net.IPAddress.Loopback, 0);
        listener.Start();
        int port = ((System.Net.IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }
}
