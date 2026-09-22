using Akka.Cluster.Hosting;
using Akka.Cluster.Sharding;
using Akka.Cluster.Tools.PublishSubscribe;
using Chess.Backend.Messaging;

namespace Chess.Backend.Akka.Ping;

internal static class PingShardingExtensions
{
    /// <summary>Registers the `pings` shard region; `IRequiredActor&lt;PingActor&gt;` then resolves to it.</summary>
    public static AkkaConfigurationBuilder WithPingSharding(this AkkaConfigurationBuilder akka, AkkaOptions options)
    {
        ArgumentNullException.ThrowIfNull(akka);
        ArgumentNullException.ThrowIfNull(options);
        return akka.WithShardRegion<PingActor>(
            PingTopics.ShardTypeName,
            (system, _, resolver) => id => Props.Create(() => new PingActor(
                id,
                resolver.GetService<IEventPublisher>(),
                DistributedPubSub.Get(system).Mediator)),
            new PingMessageExtractor(options.ShardCount),
            new ShardOptions
            {
                Role = AkkaOptions.BackendRole,
                PassivateIdleEntityAfter = TimeSpan.FromMinutes(5),
                RememberEntities = false,
            });
    }
}
