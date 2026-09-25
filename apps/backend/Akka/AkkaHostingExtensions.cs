using Akka.Cluster.Hosting;
using Akka.Cluster.Hosting.SBR;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.Persistence.Sql.Config;
using Akka.Persistence.Sql.Hosting;
using Akka.Remote.Hosting;
using Akka.Streams.Kafka.Settings;
using Chess.Backend.Akka.Outbox;
using Chess.Backend.WebApi.Live;
using LinqToDB;
using Microsoft.AspNetCore.SignalR;

namespace Chess.Backend.Akka;

internal static class AkkaHostingExtensions
{
    public const string PersistenceSchema = "akka";

    /// <summary>
    /// One ActorSystem per backend replica: remoting + cluster (SBR keep-majority), SQL journal/snapshots on the
    /// PRIMARY in schema `akka`, DistributedPubSub with its node-local <see cref="HubFanOutActor"/> fan-out to
    /// SignalR, and the sharded entity types registered by later tasks.
    /// </summary>
    public static WebApplicationBuilder AddActorSystem(this WebApplicationBuilder builder, Action<AkkaConfigurationBuilder, IServiceProvider>? configureEntities = null)
    {
        ArgumentNullException.ThrowIfNull(builder);
        AkkaOptions options = builder.Configuration.GetSection(AkkaOptions.SectionName).Get<AkkaOptions>() ?? new AkkaOptions();
        options.Validate();
        builder.Services.AddSingleton(options);
        string connectionString = builder.Configuration.GetConnectionString("Postgres")
            ?? throw new InvalidOperationException("ConnectionStrings:Postgres is not configured.");

        builder.Services.AddAkka(AkkaOptions.SystemName, (akka, sp) =>
        {
            akka
                // Akka.Streams.Kafka reads `akka.kafka.*` from the ActorSystem's config, and Akka.Hosting
                // does not load a package's reference.conf on its own: without this every consumer stream
                // dies at ConsumerSettings.Create with "Kafka config for Akka.NET consumer was not
                // provided", which (BackgroundServiceExceptionBehavior.StopHost) takes the API down too.
                .AddHocon(KafkaExtensions.DefaultSettings, HoconAddMode.Append)
                .WithRemoting(hostname: options.Hostname, port: options.Port)
                .WithClustering(new ClusterOptions
                {
                    Roles = options.Roles,
                    SeedNodes = [.. options.EffectiveSeedNodes()],
                    SplitBrainResolver = new KeepMajorityOption(),
                })
                .WithChessPersistence(connectionString)
                .WithDistributedPubSub(AkkaOptions.BackendRole)
                .WithActors((system, registry, resolver) => registry.Register<HubFanOutActor>(
                    system.ActorOf(
                        Props.Create(() => new HubFanOutActor(resolver.GetService<IHubContext<LiveHub>>(), DistributedPubSub.Get(system).Mediator)),
                        "hub-fanout")));
            configureEntities?.Invoke(akka, sp);
        });
        return builder;
    }

    /// <summary>
    /// SQL journal + snapshots on the PRIMARY in schema `akka`, with every outbound event tagged by its Kafka
    /// topic (<see cref="TopicTagger"/>, tag table) and the query side tuned so <see cref="JournalPublisher"/>
    /// sees a commit within ~200 ms instead of the 1 s + 1 s defaults.
    /// </summary>
    public static AkkaConfigurationBuilder WithChessPersistence(this AkkaConfigurationBuilder akka, string connectionString)
    {
        ArgumentNullException.ThrowIfNull(akka);
        return akka
            .AddHocon(QueryTuning, HoconAddMode.Prepend)
            .WithSqlPersistence(
                connectionString: connectionString,
                providerName: ProviderName.PostgreSQL15,
                schemaName: PersistenceSchema,
                journalBuilder: journal => journal.AddWriteEventAdapter<TopicTagger>(TopicTagger.Name, TopicTagger.BoundTypes),
                autoInitialize: true,
                tagStorageMode: TagMode.TagTable);
    }

    // Both knobs matter: refresh-interval is the idle poll, query-delay is how often the ordering-gap detector
    // looks again. A gap is waited on for max-tries (10) × query-delay = 2 s before being skipped — see design
    // D7 and the gap risk in openspec/changes/journal-outbox/design.md.
    private const string QueryTuning = """
        akka.persistence.query.journal.sql {
          refresh-interval = 200ms
          journal-sequence-retrieval.query-delay = 200ms
        }
        """;
}
