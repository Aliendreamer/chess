using Chess.Backend.Extensions;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;

namespace Chess.Backend.Data;

/// <summary>What the replica says about itself; <see cref="ReplicaHealthCheck.Evaluate"/> turns it into a verdict.</summary>
/// <param name="InRecovery">A standby at all.</param>
/// <param name="ReceiverRunning">A WAL receiver process exists, i.e. the replica is connected to the primary.</param>
/// <param name="CaughtUp">Everything received has been replayed.</param>
/// <param name="SecondsSinceReplay">Since the last replayed transaction — lag only while there is WAL to replay.</param>
internal sealed record ReplicaStatus(bool InRecovery, bool ReceiverRunning, bool CaughtUp, double SecondsSinceReplay);

/// <summary>
/// Replica reachable, a standby, connected to the primary, and replay lag under the threshold. "Time since the last
/// replayed transaction" alone grows whenever the primary is idle, so a connected replica that has replayed all it
/// received counts as zero lag. The receiver check is what keeps a disconnected replica, which also looks caught up,
/// from passing.
/// </summary>
internal sealed class ReplicaHealthCheck([FromKeyedServices(ReadDatabaseExtensions.ReplicaDataSourceKey)] NpgsqlDataSource replica) : IHealthCheck
{
    private static readonly TimeSpan MaxLag = TimeSpan.FromSeconds(10);

    // pg_stat_wal_receiver.pid is visible without pg_read_all_stats (the other columns are not), and the row only
    // exists while the receiver runs — so "pid is not null" means "connected to the primary".
    private const string Query = """
        select pg_is_in_recovery(),
               exists (select 1 from pg_stat_wal_receiver where pid is not null),
               coalesce(pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn(), false),
               coalesce(extract(epoch from now() - pg_last_xact_replay_timestamp()), 0)::float8
        """;

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        await using NpgsqlCommand cmd = replica.CreateCommand(Query);
        await using NpgsqlDataReader r = await cmd.ExecuteReaderAsync(cancellationToken);
        await r.ReadAsync(cancellationToken);
        return Evaluate(new ReplicaStatus(r.GetBoolean(0), r.GetBoolean(1), r.GetBoolean(2), r.GetDouble(3)));
    }

    internal static HealthCheckResult Evaluate(ReplicaStatus status)
    {
        ArgumentNullException.ThrowIfNull(status);
        double lagSeconds = status.CaughtUp ? 0 : status.SecondsSinceReplay;
        Dictionary<string, object> data = new(StringComparer.Ordinal)
        {
            ["lagSeconds"] = lagSeconds,
            ["inRecovery"] = status.InRecovery,
            ["receiverRunning"] = status.ReceiverRunning,
        };
        if (!status.InRecovery)
        {
            return HealthCheckResult.Degraded("replica connection is not a standby", data: data);
        }

        if (!status.ReceiverRunning)
        {
            return HealthCheckResult.Degraded("wal receiver not running: replica is disconnected from the primary", data: data);
        }

        return lagSeconds <= MaxLag.TotalSeconds
            ? HealthCheckResult.Healthy($"lag {lagSeconds:F1}s", data)
            : HealthCheckResult.Degraded($"lag {lagSeconds:F1}s > {MaxLag.TotalSeconds}s", data: data);
    }
}
