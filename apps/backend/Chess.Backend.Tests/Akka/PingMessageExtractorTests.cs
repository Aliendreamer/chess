using Chess.Backend.Akka.Ping;

namespace Chess.Backend.Tests.Akka;

public sealed class PingMessageExtractorTests
{
    [Fact]
    public void Entity_id_is_the_ping_id_and_shard_is_stable()
    {
        PingMessageExtractor x = new(50);
        Assert.Equal("p1", x.EntityId(new Ping("p1", "t", 1)));
        Assert.Equal("p1", x.EntityId(new GetPingState("p1")));
        // ShardId(object) is obsolete in favor of ShardId(string, object?), but sharding dispatches raw
        // messages through the object overload, so the stability of that exact path is what this asserts.
#pragma warning disable CS0618
        Assert.Equal(x.ShardId("p1"), x.ShardId(new Ping("p1", "t", 1)));
#pragma warning restore CS0618
        Assert.Null(x.EntityId("not a command"));
    }
}
