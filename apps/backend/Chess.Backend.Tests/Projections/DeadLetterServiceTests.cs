using Chess.Backend.Data.ReadModels;
using Chess.Backend.Projections;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.Tests.Projections;

public sealed class DeadLetterServiceTests
{
    private static readonly DateTimeOffset T0 = ProjectionHost.T0;

    private static DeadLetterService Service(ProjectDbContext db) => ProjectionHost.DeadLetters(db, new FakeClock(T0));

    private static ParkRequest Park(string group, string agg, long seq, string error = "boom") =>
        new(group, agg, seq, $"key-{agg}", $"{{\"seq\":{seq}}}", 5, error, T0.AddSeconds(-7));

    [Fact]
    public async Task Parks_every_field_and_stamps_parked_at()
    {
        using ProjectDbContext db = TestDb.Create();

        await Service(db).ParkAsync(Park("g", "a", 7), CancellationToken.None);

        ProjectionDeadLetter row = await db.ProjectionDeadLetters.SingleAsync();
        Assert.Equal(("g", "a", 7L, "key-a", "{\"seq\":7}", 5, "boom"), (row.GroupId, row.AggregateId, row.Seq, row.KafkaKey, row.Value, row.Attempts, row.LastError));
        Assert.Equal(T0.AddSeconds(-7), row.FirstFailedAt);
        Assert.Equal(T0, row.ParkedAt);
        Assert.Equal(7, row.Id.Version); // Guid v7, time-ordered (ROADMAP D11)
    }

    [Fact]
    public async Task Truncates_the_error_to_2000_chars()
    {
        using ProjectDbContext db = TestDb.Create();

        await Service(db).ParkAsync(Park("g", "a", 1, new string('x', 5000)), CancellationToken.None);

        Assert.Equal(DeadLetterService.MaxErrorLength, (await db.ProjectionDeadLetters.SingleAsync()).LastError.Length);
    }

    [Fact]
    public async Task Quarantine_is_per_group_and_aggregate()
    {
        using ProjectDbContext db = TestDb.Create();
        DeadLetterService service = Service(db);
        await service.ParkAsync(Park("g1", "a", 1), CancellationToken.None);

        Assert.True(await service.IsQuarantinedAsync("g1", "a", CancellationToken.None));
        Assert.False(await service.IsQuarantinedAsync("g2", "a", CancellationToken.None));
        Assert.False(await service.IsQuarantinedAsync("g1", "b", CancellationToken.None));
    }

    [Fact]
    public async Task Parks_behind_an_existing_quarantine_only()
    {
        using ProjectDbContext db = TestDb.Create();
        DeadLetterService service = Service(db);

        Assert.False(await service.ParkIfQuarantinedAsync(Park("g", "a", 1), CancellationToken.None));
        Assert.Equal(0, await db.ProjectionDeadLetters.CountAsync());

        await service.ParkAsync(Park("g", "a", 1), CancellationToken.None);
        Assert.True(await service.ParkIfQuarantinedAsync(Park("g", "a", 2), CancellationToken.None));
        Assert.Equal(2, await db.ProjectionDeadLetters.CountAsync());
    }

    [Fact]
    public async Task Counts_distinct_quarantined_aggregates_per_group()
    {
        using ProjectDbContext db = TestDb.Create();
        DeadLetterService service = Service(db);
        await service.ParkAsync(Park("g1", "a", 1), CancellationToken.None);
        await service.ParkAsync(Park("g1", "a", 2), CancellationToken.None);
        await service.ParkAsync(Park("g1", "b", 1), CancellationToken.None);
        await service.ParkAsync(Park("g2", "a", 1), CancellationToken.None);

        IReadOnlyDictionary<string, int> counts = await service.CountsAsync(CancellationToken.None);

        Assert.Equal(2, counts["g1"]);
        Assert.Equal(1, counts["g2"]);
    }

    /// <summary>A PingProjection that can be switched into "still buggy" mode, the way a bad deploy would behave.</summary>
    private sealed class Switch
    {
        public bool Broken { get; set; }
    }

    private sealed class SwitchableProjection(ProjectDbContext db, Switch sw) : IProjection
    {
        private readonly PingProjection _inner = new(db, NullLogger<PingProjection>.Instance);

        public string Topic => _inner.Topic;

        public string GroupId => _inner.GroupId;

        public Task ApplyAsync(string key, string json, CancellationToken ct) =>
            sw.Broken ? throw new InvalidOperationException("still broken") : _inner.ApplyAsync(key, json, ct);
    }

    private sealed class Harness
    {
        public Harness() =>
            Host = new ProjectionHost(services =>
            {
                services.AddSingleton(Switch);
                services.AddScoped<SwitchableProjection>();
                services.AddScoped<IProjection>(sp => sp.GetRequiredService<SwitchableProjection>());
            });

        public Switch Switch { get; } = new();

        public ProjectionHost Host { get; }

        public Task<ReplayResult> ReplayAsync(string group, string aggregateId) =>
            Host.ScopedAsync(sp => sp.GetRequiredService<IDeadLetterService>().ReplayAsync(group, aggregateId, CancellationToken.None));

        public Task<T> WithDbAsync<T>(Func<ProjectDbContext, Task<T>> read) => Host.WithDbAsync(read);

        public Task ApplyLiveAsync(string id, long seq) =>
            Host.ScopedAsync(sp => sp.GetRequiredService<SwitchableProjection>().ApplyAsync(id, Event(id, seq), CancellationToken.None));

        public Task ParkAsync(string id, long seq) => Host.ParkAsync("chess.rm-pings", id, seq, Event(id, seq));
    }

    private static string Event(string id, long seq) => Envelopes.Pinged(id, seq, $"t{seq}", T0.AddSeconds(seq));

    [Fact]
    public async Task Replay_after_a_fix_applies_in_seq_order_and_lifts_the_quarantine()
    {
        Harness h = new();
        for (long seq = 1; seq <= 6; seq++)
        {
            await h.ApplyLiveAsync("p1", seq);
        }

        await h.ParkAsync("p1", 8); // parked out of order on purpose: replay must sort by seq
        await h.ParkAsync("p1", 7);

        ReplayResult result = await h.ReplayAsync("chess.rm-pings", "p1");

        Assert.Equal((ReplayStatus.Completed, 2), (result.Status, result.Applied));
        RmPing row = await h.WithDbAsync(db => db.RmPings.AsNoTracking().SingleAsync());
        Assert.Equal((8L, 8L, "t8"), (row.LastSeq, row.Count, row.LastText));
        Assert.Equal(0, await h.WithDbAsync(db => db.ProjectionDeadLetters.CountAsync()));
    }

    [Fact]
    public async Task Replay_that_hits_the_bug_again_stops_and_leaves_everything_parked()
    {
        Harness h = new();
        await h.ParkAsync("p1", 1);
        await h.ParkAsync("p1", 2);
        h.Switch.Broken = true;

        ReplayResult result = await h.ReplayAsync("chess.rm-pings", "p1");

        Assert.Equal((ReplayStatus.Failed, 0), (result.Status, result.Applied));
        Assert.Contains("still broken", result.Error, StringComparison.Ordinal);
        Assert.Equal(2, await h.WithDbAsync(db => db.ProjectionDeadLetters.CountAsync()));
    }

    [Fact]
    public async Task An_unknown_group_is_reported_and_nothing_is_touched()
    {
        Harness h = new();
        await h.ParkAsync("p1", 1);

        ReplayResult result = await h.ReplayAsync("no.such.group", "p1");

        Assert.Equal(ReplayStatus.UnknownGroup, result.Status);
        Assert.Equal(1, await h.WithDbAsync(db => db.ProjectionDeadLetters.CountAsync()));
    }

    [Fact]
    public async Task Replaying_an_aggregate_with_nothing_parked_completes_with_zero()
    {
        Harness h = new();

        ReplayResult result = await h.ReplayAsync("chess.rm-pings", "p1");

        Assert.Equal((ReplayStatus.Completed, 0), (result.Status, result.Applied));
    }
}
