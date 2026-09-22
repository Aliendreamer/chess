using Akka.Cluster;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Chess.Backend.Akka;

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
