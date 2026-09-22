using Akka.Cluster.Sharding;

namespace Chess.Backend.Akka.Ping;

/// <summary>Entity id = ping id; shard id is a stable hash of the entity id over <see cref="AkkaOptions.ShardCount"/>.</summary>
internal sealed class PingMessageExtractor(int shardCount) : HashCodeMessageExtractor(shardCount)
{
    public override string? EntityId(object message) => message is IPingCommand c ? c.PingId : null;
}
