using Chess.Backend.Messaging;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Chess.Backend.Tests.Messaging;

public sealed class KafkaHealthCheckTests
{
    [Fact]
    public async Task An_unreachable_broker_is_reported_unhealthy_rather_than_thrown()
    {
        // Port 1 is never a broker: GetMetadata raises KafkaException, and the check must turn that into
        // a result. A throw here would surface as a 500 on /health instead of an unhealthy report.
        using KafkaHealthCheck check = new(new KafkaOptions { BootstrapServers = "127.0.0.1:1" });

        HealthCheckResult result = await check.CheckHealthAsync(new HealthCheckContext(), CancellationToken.None);

        Assert.Equal(HealthStatus.Unhealthy, result.Status);
        Assert.False(string.IsNullOrWhiteSpace(result.Description));
    }

    [Fact]
    public void Options_are_required()
    {
        Assert.Throws<ArgumentNullException>(() => new KafkaHealthCheck(null!));
    }
}
