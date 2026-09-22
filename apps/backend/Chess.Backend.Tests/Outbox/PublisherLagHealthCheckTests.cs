using Chess.Backend.Akka.Outbox;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Chess.Backend.Tests.Outbox;

public sealed class PublisherLagHealthCheckTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 23, 12, 0, 0, TimeSpan.Zero);

    private sealed class FakeReader(Func<IReadOnlyList<PublisherLag>> read) : IPublisherLagReader
    {
        public Task<IReadOnlyList<PublisherLag>> ReadAsync(CancellationToken ct) => Task.FromResult(read());
    }

    private static PublisherLagHealthCheck Check(params PublisherLag[] lags) =>
        new(new FakeReader(() => lags), new FakeClock(Now), new PublisherLagOptions { DegradedAfter = TimeSpan.FromSeconds(30) });

    private static Task<HealthCheckResult> Run(PublisherLagHealthCheck check) =>
        check.CheckHealthAsync(new HealthCheckContext(), CancellationToken.None);

    [Fact]
    public async Task Caught_up_is_healthy_and_reports_the_numbers()
    {
        HealthCheckResult r = await Run(Check(new PublisherLag("game.events", 41, 41, Now.AddMinutes(-10))));

        Assert.Equal(HealthStatus.Healthy, r.Status);
        Assert.Equal(0L, r.Data["game.events.lag"]);
        Assert.Equal(41L, r.Data["game.events.lastOrdering"]);
        Assert.Equal(41L, r.Data["game.events.journalHead"]);
    }

    [Fact]
    public async Task Behind_but_recently_advanced_is_healthy()
    {
        HealthCheckResult r = await Run(Check(new PublisherLag("game.events", 40, 45, Now.AddSeconds(-5))));
        Assert.Equal(HealthStatus.Healthy, r.Status);
        Assert.Equal(5L, r.Data["game.events.lag"]);
    }

    [Fact]
    public async Task Behind_and_stuck_past_the_threshold_is_degraded_never_unhealthy()
    {
        HealthCheckResult r = await Run(Check(new PublisherLag("game.events", 40, 45, Now.AddSeconds(-31))));
        Assert.Equal(HealthStatus.Degraded, r.Status);
        Assert.Contains("game.events", r.Description, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Reader_failure_is_degraded_not_unhealthy()
    {
        PublisherLagHealthCheck check = new(
            new FakeReader(() => throw new InvalidOperationException("db down")),
            new FakeClock(Now),
            new PublisherLagOptions());

        HealthCheckResult r = await Run(check);

        Assert.Equal(HealthStatus.Degraded, r.Status);
        Assert.IsType<InvalidOperationException>(r.Exception);
    }

    [Fact]
    public void Default_threshold_is_thirty_seconds() => Assert.Equal(TimeSpan.FromSeconds(30), new PublisherLagOptions().DegradedAfter);
}
