using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Chess.Backend.Tests.Data;

public sealed class ReplicaHealthCheckTests
{
    [Fact]
    public void A_caught_up_streaming_replica_is_healthy_however_long_the_primary_has_been_idle()
    {
        // The false alarm: 45s since the last replayed transaction only means nobody wrote anything.
        HealthCheckResult r = ReplicaHealthCheck.Evaluate(new ReplicaStatus(InRecovery: true, ReceiverRunning: true, CaughtUp: true, SecondsSinceReplay: 45));

        Assert.Equal(HealthStatus.Healthy, r.Status);
        Assert.Equal(0d, r.Data["lagSeconds"]);
    }

    [Fact]
    public void A_streaming_replica_behind_by_more_than_the_threshold_is_degraded()
    {
        HealthCheckResult r = ReplicaHealthCheck.Evaluate(new ReplicaStatus(true, true, CaughtUp: false, SecondsSinceReplay: 12));

        Assert.Equal(HealthStatus.Degraded, r.Status);
        Assert.Equal(12d, r.Data["lagSeconds"]);
    }

    [Fact]
    public void A_streaming_replica_behind_within_the_threshold_is_healthy()
    {
        HealthCheckResult r = ReplicaHealthCheck.Evaluate(new ReplicaStatus(true, true, CaughtUp: false, SecondsSinceReplay: 3));

        Assert.Equal(HealthStatus.Healthy, r.Status);
    }

    [Fact]
    public void A_replica_with_no_wal_receiver_is_degraded_even_when_it_looks_caught_up()
    {
        // Disconnected from the primary: receive == replay forever, which must not read as "caught up".
        HealthCheckResult r = ReplicaHealthCheck.Evaluate(new ReplicaStatus(true, ReceiverRunning: false, CaughtUp: true, SecondsSinceReplay: 0));

        Assert.Equal(HealthStatus.Degraded, r.Status);
        Assert.Contains("wal receiver", r.Description, StringComparison.Ordinal);
    }

    [Fact]
    public void A_connection_that_is_not_a_standby_is_degraded()
    {
        HealthCheckResult r = ReplicaHealthCheck.Evaluate(new ReplicaStatus(InRecovery: false, false, false, 0));

        Assert.Equal(HealthStatus.Degraded, r.Status);
        Assert.Contains("not a standby", r.Description, StringComparison.Ordinal);
    }
}
