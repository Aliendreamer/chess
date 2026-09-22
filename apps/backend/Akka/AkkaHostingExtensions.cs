using Akka.Cluster.Hosting;
using Akka.Cluster.Hosting.SBR;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.Persistence.Sql.Hosting;
using Akka.Remote.Hosting;
using Chess.Backend.WebApi.Hubs;
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
                .WithRemoting(hostname: options.Hostname, port: options.Port)
                .WithClustering(new ClusterOptions
                {
                    Roles = options.Roles,
                    SeedNodes = [.. options.EffectiveSeedNodes()],
                    SplitBrainResolver = new KeepMajorityOption(),
                })
                .WithSqlPersistence(
                    connectionString: connectionString,
                    providerName: ProviderName.PostgreSQL15,
                    schemaName: PersistenceSchema,
                    autoInitialize: true)
                .WithDistributedPubSub(AkkaOptions.BackendRole)
                .WithActors((system, registry, resolver) => registry.Register<HubFanOutActor>(
                    system.ActorOf(
                        Props.Create(() => new HubFanOutActor(resolver.GetService<IHubContext<PingsHub>>(), DistributedPubSub.Get(system).Mediator)),
                        "hub-fanout")));
            configureEntities?.Invoke(akka, sp);
        });
        return builder;
    }
}
