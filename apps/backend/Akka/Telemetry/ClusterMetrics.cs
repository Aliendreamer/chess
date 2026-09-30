using System.Diagnostics;
using System.Diagnostics.Metrics;
using Akka.Cluster.Sharding;
using Akka.Event;

namespace Chess.Backend.Akka;

/// <summary>
/// Meter <c>chess.cluster</c> (observability D8): gauges over the latest <see cref="ClusterSnapshot"/> of this node —
/// members by status, unreachable members, the singletons it hosts (1 per singleton), and its live entities per shard
/// region and shard. Grafana sums them per node for the Actors &amp; cluster dashboard.
/// </summary>
internal static class ClusterMetrics
{
    public const string MeterName = "chess.cluster";

    private static readonly Meter Meter = new(MeterName);

    private static ClusterSnapshot SnapshotValue = ClusterSnapshot.Empty;

    static ClusterMetrics()
    {
        Meter.CreateObservableGauge("chess.cluster.members", () =>
            Current.MembersByStatus.Select(m => new Measurement<int>(m.Value, new KeyValuePair<string, object?>(TelemetryTags.Status, m.Key))), description: "Cluster members by status, as this node sees them");
        Meter.CreateObservableGauge("chess.cluster.unreachable", () => Current.Unreachable, description: "Members this node cannot reach");
        Meter.CreateObservableGauge("chess.cluster.singleton", () =>
            Current.Singletons.Select(s => new Measurement<int>(1, new KeyValuePair<string, object?>(TelemetryTags.Singleton, s))), description: "Singletons hosted on this node");
        Meter.CreateObservableGauge("chess.shard.entities", () =>
            Current.Shards.Select(s => new Measurement<int>(
                s.Entities,
                new KeyValuePair<string, object?>(TelemetryTags.Region, s.Region),
                new KeyValuePair<string, object?>(TelemetryTags.Shard, s.Shard))), description: "Live entities per shard on this node");
    }

    public static ClusterSnapshot Current => Volatile.Read(ref SnapshotValue);

    public static void Publish(ClusterSnapshot snapshot) => Volatile.Write(ref SnapshotValue, snapshot);
}
