using Akka;
using Akka.Cluster.Hosting;
using Akka.Cluster.Hosting.SBR;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.DependencyInjection;
using Akka.Persistence.Query;
using Akka.Persistence.Sql.Config;
using Akka.Persistence.Sql.Hosting;
using Akka.Persistence.Sql.Query;
using Akka.Remote.Hosting;
using Akka.Streams;
using Akka.Streams.Dsl;
using Akka.Streams.Kafka.Dsl;
using Akka.Streams.Kafka.Messages;
using Akka.Streams.Kafka.Settings;
using Chess.Backend.Akka;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Akka.Outbox;
using Chess.Backend.Akka.Ping;
using Chess.Backend.Games;
using Chess.Backend.Messaging;
using Confluent.Kafka;
using LinqToDB;
using Microsoft.AspNetCore.SignalR;

namespace Chess.Backend.Extensions;

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
                    Roles = [.. options.EffectiveRoles],
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

internal static class PingShardingExtensions
{
    /// <summary>Registers the `pings` shard region; `IRequiredActor&lt;PingActor&gt;` then resolves to it.</summary>
    public static AkkaConfigurationBuilder WithPingSharding(this AkkaConfigurationBuilder akka, AkkaOptions options)
    {
        ArgumentNullException.ThrowIfNull(akka);
        ArgumentNullException.ThrowIfNull(options);
        return akka.WithShardRegion<PingActor>(
            PingTopics.ShardTypeName,
            (system, _, _) => id => Props.Create(() => new PingActor(id, DistributedPubSub.Get(system).Mediator)),
            new PingMessageExtractor(options.ShardCount),
            new ShardOptions
            {
                Role = AkkaOptions.BackendRole,
                PassivateIdleEntityAfter = TimeSpan.FromMinutes(options.IdlePassivationMinutes),
                RememberEntities = false,
            });
    }
}

internal static class MatchmakingRegistration
{
    /// <summary>The matchmaking singleton on the backend role, with a proxy so every node's endpoints reach it.</summary>
    public static AkkaConfigurationBuilder WithMatchmaking(this AkkaConfigurationBuilder akka, AkkaOptions options)
    {
        ArgumentNullException.ThrowIfNull(akka);
        return akka.WithSingleton<MatchmakingActor>(
            MatchmakingActor.SingletonName,
            (system, _, resolver) => Props.Create(() => new MatchmakingActor(
                resolver.GetService<IGameStarter>(),
                DistributedPubSub.Get(system).Mediator,
                resolver.GetService<TimeProvider>(),
                Random.Shared)),
            new ClusterSingletonOptions { Role = AkkaOptions.BackendRole },
            createProxyToo: true);
    }
}

internal static class GameShardingExtensions
{
    public const string ShardTypeName = "games";

    /// <summary>
    /// Idle passivation is OFF for this region (Akka's default is 120 s): a live game's clock timers only run while the
    /// entity is alive, and a long think sends no message through the shard. Each game passivates itself instead,
    /// per its <see cref="PassivationPolicy"/> (design D8).
    /// </summary>
    public static ShardOptions ShardOptions() => new()
    {
        Role = AkkaOptions.BackendRole,
        PassivateIdleEntityAfter = TimeSpan.Zero,
        RememberEntities = false,
    };

    /// <summary>Registers the `games` region; `IRequiredActor&lt;GameActor&gt;` then resolves to it.</summary>
    public static AkkaConfigurationBuilder WithGameSharding(this AkkaConfigurationBuilder akka, AkkaOptions options)
    {
        ArgumentNullException.ThrowIfNull(akka);
        ArgumentNullException.ThrowIfNull(options);
        return akka.WithShardRegion<GameActor>(
            ShardTypeName,
            (system, _, resolver) => id => Props.Create(() => new GameActor(
                Guid.ParseExact(id, "N"),
                DistributedPubSub.Get(system).Mediator,
                resolver.GetService<TimeProvider>(),
                options.Presence())),
            new GameMessageExtractor(options.ShardCount),
            ShardOptions());
    }
}

internal static class InviteShardingExtensions
{
    public const string ShardTypeName = "invites";

    /// <summary>The `invites` region; default idle passivation is fine, since expiry needs no timer.</summary>
    public static AkkaConfigurationBuilder WithInviteSharding(this AkkaConfigurationBuilder akka, AkkaOptions options)
    {
        ArgumentNullException.ThrowIfNull(akka);
        ArgumentNullException.ThrowIfNull(options);
        return akka.WithShardRegion<InviteActor>(
            ShardTypeName,
            (system, _, resolver) => id => Props.Create(() => new InviteActor(
                Guid.ParseExact(id, "N"),
                resolver.GetService<IGameStarter>(),
                DistributedPubSub.Get(system).Mediator,
                resolver.GetService<TimeProvider>(),
                Random.Shared)),
            new InviteMessageExtractor(options.ShardCount),
            new ShardOptions
            {
                Role = AkkaOptions.BackendRole,
                PassivateIdleEntityAfter = TimeSpan.FromMinutes(options.IdlePassivationMinutes),
                RememberEntities = false,
            });
    }
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
            (tag, after) => journal.EventsByTag(tag, global::Akka.Persistence.Query.Offset.Sequence(after)),
            producer,
            resolver.GetService<JournalPublisherOptions>(),
            resolver.GetService<ILogger<JournalPublisherLoop>>());
    }
}
