using System.Collections.Immutable;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using Akka.Cluster;
using Akka.Cluster.Sharding;
using Akka.Event;

namespace Chess.Backend.Akka;

/// <summary>
/// What the actors do, as metrics (observability D8), meter <c>chess.actors</c>: every message handled (by actor
/// type, message type and outcome) and how long it took, persist latency, recovery time, passivations, and dead or
/// unhandled messages. Labels are types only, never an entity id: a game id per series would explode Prometheus.
/// With nothing listening an instrument update costs a check.
/// </summary>
internal static class ActorMetrics
{
    public const string MeterName = "chess.actors";

    private static readonly Meter Meter = new(MeterName);
    private static readonly Counter<long> Messages = Meter.CreateCounter<long>("chess.actor.messages", description: "Messages handled by actors");
    private static readonly Histogram<double> HandleDuration = Meter.CreateHistogram<double>("chess.actor.handle.duration", "s", "Time an actor spent handling one message");
    private static readonly Histogram<double> PersistDuration = Meter.CreateHistogram<double>("chess.actor.persist.duration", "s", "Time from Persist to its callback");
    private static readonly Histogram<double> RecoveryDuration = Meter.CreateHistogram<double>("chess.actor.recovery.duration", "s", "Time from an actor's start to the end of its replay");
    private static readonly Counter<long> Passivations = Meter.CreateCounter<long>("chess.actor.passivations", description: "Entities passivated");
    private static readonly Counter<long> DeadLetters = Meter.CreateCounter<long>("chess.akka.dead_letters", description: "Messages no actor took");

    public static void Handled(string actor, string message, string outcome, TimeSpan elapsed)
    {
        TagList tags = new() { { "actor", actor }, { "message", message } };
        HandleDuration.Record(elapsed.TotalSeconds, tags);
        tags.Add("outcome", outcome);
        Messages.Add(1, tags);
    }

    public static void Persisted(string actor, string evt, TimeSpan elapsed) =>
        PersistDuration.Record(elapsed.TotalSeconds, new TagList { { "actor", actor }, { "event", evt } });

    public static void Recovered(string actor, long startedAt) =>
        RecoveryDuration.Record(Stopwatch.GetElapsedTime(startedAt).TotalSeconds, new TagList { { "actor", actor } });

    public static void Passivated(string actor) => Passivations.Add(1, new TagList { { "actor", actor } });

    public static void DeadLetter(string message, string kind) =>
        DeadLetters.Add(1, new TagList { { "message", message }, { "kind", kind } });
}

/// <summary>A node's view of the cluster, refreshed by <see cref="ClusterMetricsActor"/> and read by the gauges.</summary>
internal sealed record ClusterSnapshot(
    IReadOnlyDictionary<string, int> MembersByStatus,
    int Unreachable,
    IReadOnlyList<string> Singletons,
    IReadOnlyList<(string Region, string Shard, int Entities)> Shards)
{
    public static readonly ClusterSnapshot Empty = new(ImmutableDictionary<string, int>.Empty, 0, [], []);
}

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
            Current.MembersByStatus.Select(m => new Measurement<int>(m.Value, new KeyValuePair<string, object?>("status", m.Key))), description: "Cluster members by status, as this node sees them");
        Meter.CreateObservableGauge("chess.cluster.unreachable", () => Current.Unreachable, description: "Members this node cannot reach");
        Meter.CreateObservableGauge("chess.cluster.singleton", () =>
            Current.Singletons.Select(s => new Measurement<int>(1, new KeyValuePair<string, object?>("singleton", s))), description: "Singletons hosted on this node");
        Meter.CreateObservableGauge("chess.shard.entities", () =>
            Current.Shards.Select(s => new Measurement<int>(
                s.Entities,
                new KeyValuePair<string, object?>("region", s.Region),
                new KeyValuePair<string, object?>("shard", s.Shard))), description: "Live entities per shard on this node");
    }

    public static ClusterSnapshot Current => Volatile.Read(ref SnapshotValue);

    public static void Publish(ClusterSnapshot snapshot) => Volatile.Write(ref SnapshotValue, snapshot);
}

/// <summary>
/// One per node. Every <c>Observability:ClusterSampleSeconds</c> it reads the cluster state and asks each local shard
/// region for its shards (<see cref="GetShardRegionState"/>), then publishes the snapshot for the gauges; it also counts
/// dead, dropped and unhandled messages from the event stream. Singletons live on the oldest member with the backend
/// role, so a node hosts them exactly when it is that member.
/// </summary>
internal sealed class ClusterMetricsActor : ReceiveActor, IWithTimers
{
    private readonly IReadOnlyDictionary<string, IActorRef> _regions;
    private readonly IReadOnlyList<string> _singletons;
    private readonly string _role;
    private readonly TimeSpan _every;
    private readonly Dictionary<string, CurrentShardRegionState> _regionStates = new(StringComparer.Ordinal);

    public ClusterMetricsActor(IReadOnlyDictionary<string, IActorRef> regions, IReadOnlyList<string> singletons, string role, TimeSpan every)
    {
        _regions = regions;
        _singletons = singletons;
        _role = role;
        _every = every;

        Receive<Sample>(_ => SampleNow());
        Receive<RegionState>(r => _regionStates[r.Region] = r.State);
        Receive<Status.Failure>(_ => { });
        // UnhandledMessage is itself an AllDeadLetters in Akka.NET 1.5, so it must be matched first.
        Receive<UnhandledMessage>(u => ActorMetrics.DeadLetter(ActorTracing.Unwrap(u.Message).GetType().Name, "unhandled"));
        Receive<AllDeadLetters>(d => ActorMetrics.DeadLetter(ActorTracing.Unwrap(d.Message).GetType().Name, d switch
        {
            Dropped => "dropped",
            SuppressedDeadLetter => "suppressed",
            _ => "dead",
        }));
    }

    public ITimerScheduler Timers { get; set; } = null!;

    protected override void PreStart()
    {
        Context.System.EventStream.Subscribe(Self, typeof(AllDeadLetters));
        Context.System.EventStream.Subscribe(Self, typeof(UnhandledMessage));
        Timers.StartPeriodicTimer(nameof(Sample), Sample.Instance, TimeSpan.Zero, _every);
    }

    protected override void PostStop()
    {
        Context.System.EventStream.Unsubscribe(Self);
        base.PostStop();
    }

    /// <summary>Builds the snapshot from the cluster state and the region answers of the previous round.</summary>
    internal static ClusterSnapshot Snapshot(
        ClusterEvent.CurrentClusterState state,
        Member self,
        string role,
        IReadOnlyList<string> singletons,
        IReadOnlyDictionary<string, CurrentShardRegionState> regions)
    {
        ArgumentNullException.ThrowIfNull(state);
        Member? oldest = state.Members
            .Where(m => m.HasRole(role) && m.Status == MemberStatus.Up)
            .Aggregate((Member?)null, (o, m) => o is null || m.IsOlderThan(o) ? m : o);
        return new ClusterSnapshot(
            state.Members.GroupBy(m => m.Status.ToString()).ToDictionary(g => g.Key, g => g.Count(), StringComparer.Ordinal),
            state.Unreachable.Count,
            oldest is not null && oldest.Address == self.Address ? singletons : [],
            [.. regions.SelectMany(r => r.Value.Shards.Select(s => (r.Key, s.ShardId, s.EntityIds.Count)))]);
    }

    private void SampleNow()
    {
        if (((ExtendedActorSystem)Context.System).Provider is not IClusterActorRefProvider)
        {
            return; // a local system (tests) has no cluster to sample; dead letters are still counted
        }

        Cluster cluster = Cluster.Get(Context.System);
        ClusterMetrics.Publish(Snapshot(cluster.State, cluster.SelfMember, _role, _singletons, _regionStates));
        foreach ((string name, IActorRef region) in _regions)
        {
            region.Ask<CurrentShardRegionState>(GetShardRegionState.Instance, _every)
                .PipeTo(Self, success: s => new RegionState(name, s));
        }
    }

    private sealed class Sample
    {
        public static readonly Sample Instance = new();
    }

    private sealed record RegionState(string Region, CurrentShardRegionState State);
}

/// <summary>
/// Meter <c>chess.pipeline</c> (observability D8): records the journal publisher produced per topic, and how far it is
/// behind the journal; each projection group's records by outcome and their handling time, and its quarantined
/// aggregates. Lag and quarantine are read by the health checks already; the gauges show their latest reading.
/// </summary>
internal static class PipelineMetrics
{
    public const string MeterName = "chess.pipeline";

    private static readonly Meter Meter = new(MeterName);
    private static readonly Counter<long> Published = Meter.CreateCounter<long>("chess.outbox.published", description: "Records the journal publisher produced");
    private static readonly Counter<long> Records = Meter.CreateCounter<long>("chess.projection.records", description: "Kafka records per consumer group, by outcome");
    private static readonly Histogram<double> RecordDuration = Meter.CreateHistogram<double>("chess.projection.duration", "s", "Time to handle one record, retries included");

    private static ImmutableDictionary<string, long> LagByTopic = ImmutableDictionary<string, long>.Empty;
    private static ImmutableDictionary<string, int> QuarantinedByGroup = ImmutableDictionary<string, int>.Empty;

    static PipelineMetrics()
    {
        Meter.CreateObservableGauge("chess.outbox.lag", () =>
            Volatile.Read(ref LagByTopic).Select(l => new Measurement<long>(l.Value, new KeyValuePair<string, object?>("topic", l.Key))), description: "Journal events not yet on Kafka, per topic");
        Meter.CreateObservableGauge("chess.projection.quarantined", () =>
            Volatile.Read(ref QuarantinedByGroup).Select(q => new Measurement<int>(q.Value, new KeyValuePair<string, object?>("group", q.Key))), description: "Aggregates parked per consumer group");
    }

    public static void Produced(string topic, int count) => Published.Add(count, new TagList { { "topic", topic } });

    public static void Projected(string group, string outcome, TimeSpan elapsed)
    {
        Records.Add(1, new TagList { { "group", group }, { "outcome", outcome } });
        RecordDuration.Record(elapsed.TotalSeconds, new TagList { { "group", group } });
    }

    public static void Lag(string topic, long lag) => ImmutableInterlocked.AddOrUpdate(ref LagByTopic, topic, lag, (_, _) => lag);

    /// <summary>The latest quarantine counts; a group with none left reads 0 rather than keeping its last value.</summary>
    public static void Quarantined(IReadOnlyDictionary<string, int> counts)
    {
        ArgumentNullException.ThrowIfNull(counts);
        ImmutableDictionary<string, int> next = Volatile.Read(ref QuarantinedByGroup).ToImmutableDictionary(q => q.Key, _ => 0);
        Volatile.Write(ref QuarantinedByGroup, next.SetItems(counts));
    }
}
