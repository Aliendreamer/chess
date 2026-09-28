using System.Collections.Immutable;
using System.Diagnostics.Metrics;
using Akka.Cluster;
using Akka.Cluster.Sharding;
using Akka.Event;

namespace Chess.Backend.Akka;

/// <summary>A node's view of the cluster, refreshed by <see cref="ClusterMetricsActor"/> and read by the gauges.</summary>
internal sealed record ClusterSnapshot(
    IReadOnlyDictionary<string, int> MembersByStatus,
    int Unreachable,
    IReadOnlyList<string> Singletons,
    IReadOnlyList<(string Region, string Shard, int Entities)> Shards)
{
    public static readonly ClusterSnapshot Empty = new(ImmutableDictionary<string, int>.Empty, 0, [], []);
}
