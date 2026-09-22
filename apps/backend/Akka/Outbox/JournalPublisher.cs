using Akka;
using Akka.Cluster.Hosting;
using Akka.DependencyInjection;
using Akka.Persistence.Query;
using Akka.Persistence.Sql.Query;
using Akka.Streams;
using Akka.Streams.Dsl;
using Akka.Streams.Kafka.Dsl;
using Akka.Streams.Kafka.Messages;
using Akka.Streams.Kafka.Settings;
using Chess.Backend.Messaging;
using Confluent.Kafka;
using Offset = Akka.Persistence.Query.Offset;

namespace Chess.Backend.Akka.Outbox;

/// <summary>
/// Cluster-singleton shell around <see cref="JournalPublisherLoop"/>: the singleton decides WHERE the publisher
/// runs (oldest `backend` node, handed over on leave/down); the loop's Postgres lease decides WHETHER it may
/// publish, which is what keeps a split brain from producing twice (design D5).
/// </summary>
internal sealed class JournalPublisher : ReceiveActor
{
    public const string SingletonName = "journal-publisher";

    private readonly Func<ActorSystem, JournalPublisherLoop> _createLoop;
    private CancellationTokenSource? _stop;

    public JournalPublisher(Func<ActorSystem, JournalPublisherLoop> createLoop)
    {
        ArgumentNullException.ThrowIfNull(createLoop);
        _createLoop = createLoop;
    }

    protected override void PreStart()
    {
        CancellationTokenSource stop = new();
        _stop = stop;
        // RunAsync never throws; dispose the source only once the loop has let go of its token.
        _ = _createLoop(Context.System).RunAsync(stop.Token).ContinueWith(_ => stop.Dispose(), TaskScheduler.Default);
    }

    protected override void PostStop() => _stop?.Cancel();
}

internal static class JournalPublisherRegistration
{
    /// <summary>Registers the publisher singleton on the `backend` role. Only called when Kafka is enabled.</summary>
    public static AkkaConfigurationBuilder WithJournalPublisher(this AkkaConfigurationBuilder akka)
    {
        ArgumentNullException.ThrowIfNull(akka);
        return akka.WithSingleton<JournalPublisher>(
            JournalPublisher.SingletonName,
            (_, _, resolver) => Props.Create(() => new JournalPublisher(system => CreateLoop(system, resolver))),
            new ClusterSingletonOptions { Role = AkkaOptions.BackendRole },
            createProxyToo: false);
    }

    [ExcludeFromCodeCoverage(Justification = "Composition of the real SQL read journal and Kafka producer; exercised by the integration suite.")]
    private static JournalPublisherLoop CreateLoop(ActorSystem system, IDependencyResolver resolver)
    {
        KafkaOptions kafka = resolver.GetService<KafkaOptions>();
        SqlReadJournal journal = PersistenceQuery.Get(system).ReadJournalFor<SqlReadJournal>(SqlReadJournal.Identifier);
        ProducerSettings<string, string> settings = ProducerSettings<string, string>
            .Create(system, Serializers.Utf8, Serializers.Utf8)
            .WithBootstrapServers(kafka.BootstrapServers)
            .WithProperty("enable.idempotence", "true")
            .WithProperty("acks", "all");
        // FlexiFlow emits results in input order, so the pass-through ordering stays monotonic per stream.
        Flow<(OutboxRecord Record, long Ordering), long, NotUsed> producer = Flow.Create<(OutboxRecord Record, long Ordering)>()
            .Select(x => ProducerMessage.Single(new ProducerRecord<string, string>(x.Record.Topic, x.Record.Key, x.Record.Json), x.Ordering))
            .Via(KafkaProducer.FlexiFlow<string, string, long>(settings))
            .Select(r => r.PassThrough);
        return new JournalPublisherLoop(
            system.Materializer(),
            resolver.GetService<IPublisherLeaseProvider>(),
            resolver.GetService<JournalEventMappers>(),
            (tag, after) => journal.EventsByTag(tag, Offset.Sequence(after)),
            producer,
            resolver.GetService<JournalPublisherOptions>(),
            resolver.GetService<ILogger<JournalPublisherLoop>>());
    }
}
