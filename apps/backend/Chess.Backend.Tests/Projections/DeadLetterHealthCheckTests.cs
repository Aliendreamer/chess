using Chess.Backend.Projections;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Chess.Backend.Tests.Projections;

public sealed class DeadLetterHealthCheckTests
{
    private static readonly DateTimeOffset T0 = DateTimeOffset.UnixEpoch;

    [Fact]
    public async Task Nothing_parked_is_healthy()
    {
        using ProjectDbContext db = TestDb.Create();
        DeadLetterHealthCheck check = new(new DeadLetterStore(db, NullLogger<DeadLetterStore>.Instance, new FakeClock(T0)));

        HealthCheckResult result = await check.CheckHealthAsync(new HealthCheckContext());

        Assert.Equal(HealthStatus.Healthy, result.Status);
    }

    [Fact]
    public async Task A_quarantined_aggregate_degrades_and_reports_its_group()
    {
        using ProjectDbContext db = TestDb.Create();
        DeadLetterStore store = new(db, NullLogger<DeadLetterStore>.Instance, new FakeClock(T0));
        await store.ParkAsync(new ParkRequest("chess.rm-pings", "p1", 7, "p1", "{}", 5, "bug", T0), CancellationToken.None);
        await store.ParkAsync(new ParkRequest("chess.rm-pings", "p1", 8, "p1", "{}", 0, "behind", T0), CancellationToken.None);

        HealthCheckResult result = await new DeadLetterHealthCheck(store).CheckHealthAsync(new HealthCheckContext());

        Assert.Equal(HealthStatus.Degraded, result.Status);
        Assert.Equal(1, result.Data["chess.rm-pings"]);
    }
}
