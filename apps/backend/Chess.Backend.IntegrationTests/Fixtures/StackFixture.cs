using System.Globalization;
using System.Net;
using System.Net.Sockets;
using Chess.Backend.Analysis;
using Chess.Backend.Engine;
using Confluent.Kafka;
using Confluent.Kafka.Admin;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
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

    /// <summary>Catches the notification mails (correspondence-games D4): SMTP on 1025, its API on 8025.</summary>
    private readonly IContainer _mailpit = new ContainerBuilder("axllent/mailpit:v1.31.3")
        .WithPortBinding(1025, true)
        .WithPortBinding(8025, true)
        .WithWaitStrategy(Wait.ForUnixContainer().UntilHttpRequestIsSucceeded(r => r.ForPort(8025).ForPath("/livez")))
        .Build();

    /// <summary>Mailpit's HTTP API, e.g. <c>{MailpitApi}/api/v1/messages</c>.</summary>
    public Uri MailpitApi => new($"http://{_mailpit.Hostname}:{_mailpit.GetMappedPublicPort(8025)}");

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
        "Akka__AbandonAfterSeconds",
        "Akka__PresenceLeaseSeconds",
        "Engine__MinThinkMs",
        "Engine__MaxThinkMs",
        "Engine__StallSeconds",
        "Correspondence__MoveDeadline",
        "Correspondence__SweepSeconds",
        "Smtp__Host",
        "Smtp__Port",
    ];

    /// <summary>Presence timings shortened from 60 s / 75 s so abandonment is testable in seconds.</summary>
    public const int AbandonAfterSeconds = 3;

    public const int PresenceLeaseSeconds = 6;

    /// <summary>The engine's stall time shortened from 60 s, so a lost request is re-asked within the test.</summary>
    public const int EngineStallSeconds = 3;

    /// <summary>A correspondence move's deadline, shortened from 7 days so a forfeit happens within the test.</summary>
    public static readonly TimeSpan MoveDeadline = TimeSpan.FromSeconds(8);

    public async Task InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _redpanda.StartAsync(), _mailpit.StartAsync());
        await CreateEngineTopicsAsync();

        Environment.SetEnvironmentVariable("ConnectionStrings__Postgres", PostgresConnectionString);
        Environment.SetEnvironmentVariable("ConnectionStrings__PostgresReplica", PostgresConnectionString);
        Environment.SetEnvironmentVariable("Kafka__BootstrapServers", BootstrapServers);
        Environment.SetEnvironmentVariable("Akka__Hostname", "127.0.0.1");
        Environment.SetEnvironmentVariable("Akka__Port", AkkaPort.ToString(CultureInfo.InvariantCulture));
        Environment.SetEnvironmentVariable("Akka__AbandonAfterSeconds", AbandonAfterSeconds.ToString(CultureInfo.InvariantCulture));
        Environment.SetEnvironmentVariable("Akka__PresenceLeaseSeconds", PresenceLeaseSeconds.ToString(CultureInfo.InvariantCulture));
        Environment.SetEnvironmentVariable("Engine__MinThinkMs", "100");
        Environment.SetEnvironmentVariable("Engine__MaxThinkMs", "200");
        Environment.SetEnvironmentVariable("Engine__StallSeconds", EngineStallSeconds.ToString(CultureInfo.InvariantCulture));
        Environment.SetEnvironmentVariable("Correspondence__MoveDeadline", MoveDeadline.ToString("c", CultureInfo.InvariantCulture));
        Environment.SetEnvironmentVariable("Correspondence__SweepSeconds", "1");
        Environment.SetEnvironmentVariable("News__Enabled", "false"); // no fetches to the internet from tests
        Environment.SetEnvironmentVariable("Smtp__Host", _mailpit.Hostname);
        Environment.SetEnvironmentVariable("Smtp__Port", _mailpit.GetMappedPublicPort(1025).ToString(CultureInfo.InvariantCulture));
    }

    public async Task DisposeAsync()
    {
        foreach (string variable in OwnedVariables)
        {
            Environment.SetEnvironmentVariable(variable, null);
        }

        await _postgres.DisposeAsync();
        await _redpanda.DisposeAsync();
        await _mailpit.DisposeAsync();
    }

    /// <summary>
    /// The engine and analysis topics exist before anything subscribes, as <c>redpanda-init</c> makes them in the local stack; the other
    /// topics are auto-created by their first producer, which only ever runs before their consumers read.
    /// </summary>
    private async Task CreateEngineTopicsAsync()
    {
        using IAdminClient admin = new AdminClientBuilder(new AdminClientConfig { BootstrapServers = BootstrapServers }).Build();
        await admin.CreateTopicsAsync(
        [
            new TopicSpecification { Name = EngineTopics.Requests, NumPartitions = 3, ReplicationFactor = 1 },
            new TopicSpecification { Name = EngineTopics.Results, NumPartitions = 3, ReplicationFactor = 1 },
            new TopicSpecification { Name = AnalysisTopics.Requests, NumPartitions = 3, ReplicationFactor = 1 },
            new TopicSpecification { Name = AnalysisTopics.Results, NumPartitions = 3, ReplicationFactor = 1 },
        ]);
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
