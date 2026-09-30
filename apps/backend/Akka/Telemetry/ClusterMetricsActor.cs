using System.Diagnostics;
using System.Diagnostics.Metrics;
using Akka.Cluster;
using Akka.Cluster.Sharding;
using Akka.Event;

namespace Chess.Backend.Akka;

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
        Receive<UnhandledMessage>(u => ActorMetrics.DeadLetter(ActorTracing.Unwrap(u.Message).GetType().Name, DeadLetterKind.Unhandled));
        Receive<AllDeadLetters>(d => ActorMetrics.DeadLetter(ActorTracing.Unwrap(d.Message).GetType().Name, d switch
        {
            Dropped => DeadLetterKind.Dropped,
            SuppressedDeadLetter => DeadLetterKind.Suppressed,
            _ => DeadLetterKind.Dead,
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
