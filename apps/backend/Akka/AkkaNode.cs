using System.Diagnostics;
using Akka.Cluster;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Chess.Backend.Akka;

internal sealed class AkkaOptions
{
    public const string SectionName = "Akka";
    public const string SystemName = "chess";
    public const string BackendRole = "backend";

    /// <summary>Hostname this node advertises to the cluster (container name in compose).</summary>
    public string Hostname { get; set; } = "localhost";

    public int Port { get; set; } = 8091;

    /// <summary>Static seed nodes; empty means "seed with myself" (single-node cluster).</summary>
    public string[] SeedNodes { get; set; } = [];

    public string[] Roles { get; set; } = [BackendRole];

    /// <summary>Number of shards per sharded entity type; changing it after data exists is a migration.</summary>
    public int ShardCount { get; set; } = 50;

    /// <summary>How long a player may be away before the other may claim the game (presence-and-abandonment).</summary>
    public int AbandonAfterSeconds { get; set; } = 60;

    /// <summary>How long a BFF instance's presence report lasts without a refresh (the BFF refreshes every 30 s).</summary>
    public int PresenceLeaseSeconds { get; set; } = 75;

    public Games.PresenceTimings Presence() =>
        new(TimeSpan.FromSeconds(AbandonAfterSeconds), TimeSpan.FromSeconds(PresenceLeaseSeconds));

    public string SelfAddress => $"akka.tcp://{SystemName}@{Hostname}:{Port}";

    public IReadOnlyList<string> EffectiveSeedNodes() => SeedNodes.Length == 0 ? [SelfAddress] : SeedNodes;

    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(Hostname))
        {
            throw new InvalidOperationException("Akka:Hostname must be set.");
        }

        if (Port is <= 0 or > 65535)
        {
            throw new InvalidOperationException("Akka:Port must be 1-65535.");
        }

        if (AbandonAfterSeconds <= 0 || PresenceLeaseSeconds <= 0)
        {
            throw new InvalidOperationException("Akka:AbandonAfterSeconds and Akka:PresenceLeaseSeconds must be positive.");
        }

        foreach (string seed in SeedNodes)
        {
            if (!Uri.TryCreate(seed, UriKind.Absolute, out Uri? uri)
                || uri.Scheme != "akka.tcp"
                || uri.UserInfo != SystemName)
            {
                throw new InvalidOperationException($"Akka:SeedNodes entry '{seed}' must look like akka.tcp://{SystemName}@host:port.");
            }
        }
    }
}

/// <summary>Healthy once this node is a member with status Up.</summary>
internal sealed class ClusterHealthCheck(ActorSystem system) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        Member self = Cluster.Get(system).SelfMember;
        HealthCheckResult result = self.Status == MemberStatus.Up
            ? HealthCheckResult.Healthy($"member {self.Address} is Up")
            : HealthCheckResult.Unhealthy($"member {self.Address} is {self.Status}");
        return Task.FromResult(result);
    }
}

/// <summary>
/// The one <see cref="ActivitySource"/> the actors emit on. Spans exist only while something listens —
/// with tracing off <see cref="ActivitySource.StartActivity(string, ActivityKind)"/> returns null and the
/// call sites cost a null check, which is why the actors can instrument unconditionally.
/// </summary>
internal static class ActorTracing
{
    public const string SourceName = "chess.actors";

    public static readonly ActivitySource Source = new(SourceName);

    /// <summary>The span around one <c>Ping</c> command: persist → pubsub → reply.</summary>
    public static Activity? StartPingHandle(string pingId, long seq)
    {
        Activity? activity = Source.StartActivity("ping.handle");
        activity?.SetTag("ping.id", pingId);
        activity?.SetTag("ping.seq", seq);
        return activity;
    }

    /// <summary>The span around one acked publisher batch: saving its highest ordering through the lease.</summary>
    public static Activity? StartOutboxBatch(string streamId, int count, long lastOrdering)
    {
        Activity? activity = Source.StartActivity("outbox.batch");
        activity?.SetTag("outbox.stream", streamId);
        activity?.SetTag("outbox.count", count);
        activity?.SetTag("outbox.last_ordering", lastOrdering);
        return activity;
    }
}
