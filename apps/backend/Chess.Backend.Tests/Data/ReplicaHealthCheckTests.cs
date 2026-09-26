using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Chess.Backend.Tests.Data;

public sealed class ReplicaHealthCheckTests
{
    [Theory]
    // The false alarm: 45 s since the last replayed transaction only means nobody wrote anything.
    [InlineData(true, true, true, 45, HealthStatus.Healthy, 0d, null)]
    [InlineData(true, true, false, 12, HealthStatus.Degraded, 12d, null)] // streaming but behind past the threshold
    [InlineData(true, true, false, 3, HealthStatus.Healthy, 3d, null)] // streaming, behind within the threshold
    // Disconnected from the primary: receive == replay forever, which must not read as "caught up".
    [InlineData(true, false, true, 0, HealthStatus.Degraded, null, "wal receiver")]
    [InlineData(false, false, false, 0, HealthStatus.Degraded, null, "not a standby")]
    public void Evaluates_standby_state_and_replay_lag(
        bool inRecovery, bool receiverRunning, bool caughtUp, int secondsSinceReplay, HealthStatus expected, double? lagSeconds, string? description)
    {
        HealthCheckResult r = ReplicaHealthCheck.Evaluate(new ReplicaStatus(inRecovery, receiverRunning, caughtUp, secondsSinceReplay));

        Assert.Equal(expected, r.Status);
        if (lagSeconds is not null)
        {
            Assert.Equal(lagSeconds.Value, r.Data["lagSeconds"]);
        }

        if (description is not null)
        {
            Assert.Contains(description, r.Description, StringComparison.Ordinal);
        }
    }
}
