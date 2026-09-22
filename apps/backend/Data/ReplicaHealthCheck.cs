using Chess.Backend.Extensions;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;

namespace Chess.Backend.Data;

/// <summary>Replica reachable, in recovery, and replay lag under the threshold.</summary>
internal sealed class ReplicaHealthCheck([FromKeyedServices(ReadDatabaseExtensions.ReplicaDataSourceKey)] NpgsqlDataSource replica) : IHealthCheck
{
    private static readonly TimeSpan MaxLag = TimeSpan.FromSeconds(10);

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        await using NpgsqlCommand cmd = replica.CreateCommand(
            "select pg_is_in_recovery(), coalesce(extract(epoch from now() - pg_last_xact_replay_timestamp()), 0)");
        await using NpgsqlDataReader r = await cmd.ExecuteReaderAsync(cancellationToken);
        await r.ReadAsync(cancellationToken);
        bool inRecovery = r.GetBoolean(0);
        double lagSeconds = r.GetDouble(1);
        Dictionary<string, object> data = new(StringComparer.Ordinal) { ["lagSeconds"] = lagSeconds, ["inRecovery"] = inRecovery };
        if (!inRecovery)
        {
            return HealthCheckResult.Degraded("replica connection is not a standby", data: data);
        }

        return lagSeconds <= MaxLag.TotalSeconds
            ? HealthCheckResult.Healthy($"lag {lagSeconds:F1}s", data)
            : HealthCheckResult.Degraded($"lag {lagSeconds:F1}s > {MaxLag.TotalSeconds}s", data: data);
    }
}
