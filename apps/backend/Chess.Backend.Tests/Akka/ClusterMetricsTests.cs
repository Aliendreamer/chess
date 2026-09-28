using System.Collections.Immutable;
using Akka.Actor;
using Akka.Cluster;
using Akka.Cluster.Sharding;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka;

namespace Chess.Backend.Tests.Akka;

/// <summary>
/// The cluster gauges (observability D8) on a real one-node cluster: members by status, the singletons this node hosts
/// (it is the oldest backend member), and its entities per shard as the regions report them.
/// </summary>
public sealed class ClusterMetricsTests() : TestKit("""
    akka.actor.provider = cluster
    akka.remote.dot-netty.tcp.hostname = 127.0.0.1
    akka.remote.dot-netty.tcp.port = 0
    akka.cluster.roles = ["backend"]
    """)
{
    private Cluster UpCluster()
    {
        Cluster cluster = Cluster.Get(Sys);
        cluster.Join(cluster.SelfAddress);
        AwaitCondition(() => cluster.SelfMember.Status == MemberStatus.Up, TimeSpan.FromSeconds(10));
        return cluster;
    }

    private static CurrentShardRegionState Region(params (string Shard, string[] Entities)[] shards) =>
        new([.. shards.Select(s => new ShardState(s.Shard, [.. s.Entities]))], ImmutableHashSet<string>.Empty);

    [Fact]
    public void The_oldest_backend_member_hosts_the_singletons_and_counts_its_entities_per_shard()
    {
        Cluster cluster = UpCluster();

        ClusterSnapshot snapshot = ClusterMetricsActor.Snapshot(
            cluster.State,
            cluster.SelfMember,
            "backend",
            ["matchmaking", "deadline-sweeper"],
            new Dictionary<string, CurrentShardRegionState> { ["games"] = Region(("7", ["g1", "g2"]), ("12", ["g3"])) });

        Assert.Equal(1, snapshot.MembersByStatus["Up"]);
        Assert.Equal(0, snapshot.Unreachable);
        Assert.Equal(["matchmaking", "deadline-sweeper"], snapshot.Singletons);
        Assert.Equal([("games", "12", 1), ("games", "7", 2)], snapshot.Shards.OrderBy(s => s.Shard, StringComparer.Ordinal));
    }

    [Fact]
    public void A_member_without_the_role_hosts_no_singleton()
    {
        Cluster cluster = UpCluster();

        ClusterSnapshot snapshot = ClusterMetricsActor.Snapshot(cluster.State, cluster.SelfMember, "engine", ["matchmaking"], new Dictionary<string, CurrentShardRegionState>());

        Assert.Empty(snapshot.Singletons);
    }

    [Fact]
    public void The_actor_asks_every_region_and_publishes_what_they_answer()
    {
        UpCluster();
        global::Akka.TestKit.TestProbe games = CreateTestProbe();
        Dictionary<string, IActorRef> regions = new() { ["games"] = games.Ref };
        string[] singletons = ["matchmaking"];
        Sys.ActorOf(Props.Create(() => new ClusterMetricsActor(regions, singletons, "backend", TimeSpan.FromMilliseconds(200))));

        games.ExpectMsg<GetShardRegionState>();
        games.Reply(Region(("3", ["g1", "g2", "g3"])));

        AwaitCondition(() => ClusterMetrics.Current.Shards.Contains(("games", "3", 3)), TimeSpan.FromSeconds(5));
        Assert.Contains("matchmaking", ClusterMetrics.Current.Singletons);
    }
}
