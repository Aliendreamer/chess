using Chess.Backend.Data.ReadModels;
using Chess.Backend.Events;
using Chess.Backend.Projections;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.Tests.Projections;

public sealed class DeadLetterReplayerTests
{
    private static readonly DateTimeOffset T0 = DateTimeOffset.Parse("2026-09-24T10:00:00Z", System.Globalization.CultureInfo.InvariantCulture);

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
        public Harness()
        {
            string db = Guid.NewGuid().ToString("N");
            ServiceCollection services = new();
            services.AddLogging();
            services.AddSingleton(Switch);
            services.AddSingleton<TimeProvider>(new FakeClock(T0));
            services.AddScoped(_ => TestDb.Create(name: db));
            services.AddScoped<IDeadLetterStore, DeadLetterStore>();
            services.AddScoped<SwitchableProjection>();
            services.AddScoped<IProjection>(sp => sp.GetRequiredService<SwitchableProjection>());
            Provider = services.BuildServiceProvider();
        }

        public Switch Switch { get; } = new();

        public ServiceProvider Provider { get; }

        public async Task<ReplayResult> ReplayAsync(string group, string aggregateId)
        {
            using IServiceScope scope = Provider.CreateScope();
            DeadLetterReplayer replayer = new(
                scope.ServiceProvider.GetRequiredService<ProjectDbContext>(),
                NullLogger<DeadLetterReplayer>.Instance,
                scope.ServiceProvider.GetRequiredService<IDeadLetterStore>(),
                scope.ServiceProvider.GetRequiredService<IServiceScopeFactory>());
            return await replayer.ReplayAsync(group, aggregateId, CancellationToken.None);
        }

        public async Task<T> WithDbAsync<T>(Func<ProjectDbContext, Task<T>> read)
        {
            using IServiceScope scope = Provider.CreateScope();
            return await read(scope.ServiceProvider.GetRequiredService<ProjectDbContext>());
        }

        public async Task ApplyLiveAsync(string id, long seq)
        {
            using IServiceScope scope = Provider.CreateScope();
            await scope.ServiceProvider.GetRequiredService<SwitchableProjection>().ApplyAsync(id, Event(id, seq), CancellationToken.None);
        }

        public async Task ParkAsync(string id, long seq)
        {
            using IServiceScope scope = Provider.CreateScope();
            await scope.ServiceProvider.GetRequiredService<IDeadLetterStore>()
                .ParkAsync(new ParkRequest("chess.rm-pings", id, seq, id, Event(id, seq), 5, "bug", T0), CancellationToken.None);
        }
    }

    private static string Event(string id, long seq) =>
        EventJson.Serialize(new EventEnvelope<Pinged>(EventTypes.Pinged, 1, id, seq, T0.AddSeconds(seq), new Pinged($"t{seq}", 1, T0.AddSeconds(seq))));

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
