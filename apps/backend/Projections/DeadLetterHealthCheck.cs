using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Chess.Backend.Projections;

/// <summary>
/// Quarantined aggregates per consumer group on <c>/health</c> (design D8). Never Unhealthy: one parked game means
/// its lists are stale, not that the API is down, and every other aggregate is still flowing.
/// </summary>
internal sealed class DeadLetterHealthCheck(IDeadLetterStore store) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        IReadOnlyDictionary<string, int> counts = await store.CountsAsync(cancellationToken);
        if (counts.Count == 0)
        {
            return HealthCheckResult.Healthy("No quarantined aggregates.");
        }

        Dictionary<string, object> data = counts.ToDictionary(c => c.Key, c => (object)c.Value, StringComparer.Ordinal);
        return HealthCheckResult.Degraded($"{counts.Values.Sum()} quarantined aggregate(s); replay after fixing.", data: data);
    }
}
