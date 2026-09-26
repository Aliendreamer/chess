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

    [Theory]
    [InlineData(41, 41, 600, HealthStatus.Healthy)] // caught up, however long ago it last moved
    [InlineData(40, 45, 5, HealthStatus.Healthy)] // behind but recently advanced
    [InlineData(40, 45, 31, HealthStatus.Degraded)] // behind and stuck past the threshold: degraded, never unhealthy
    public async Task Status_depends_on_lag_and_time_since_the_last_advance(long lastOrdering, long journalHead, int secondsSinceAdvance, HealthStatus expected)
    {
        HealthCheckResult r = await Run(Check(new PublisherLag("game.events", lastOrdering, journalHead, Now.AddSeconds(-secondsSinceAdvance))));

        Assert.Equal(expected, r.Status);
        Assert.Equal(journalHead - lastOrdering, r.Data["game.events.lag"]);
        Assert.Equal(lastOrdering, r.Data["game.events.lastOrdering"]);
        Assert.Equal(journalHead, r.Data["game.events.journalHead"]);
        if (expected == HealthStatus.Degraded)
        {
            Assert.Contains("game.events", r.Description, StringComparison.Ordinal);
        }
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
