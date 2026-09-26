using Chess.Backend.Data;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Events;
using Chess.Backend.IntegrationTests.Fixtures;
using Chess.Backend.Projections;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// What the EF InMemory provider can't show (design D2, D5): a racing first insert is a real 23505 that the
/// runner absorbs, and the transaction-scoped advisory lock really makes a park wait for a replay step.
/// </summary>
public sealed class ProjectionConflictTests(PostgresFixture pg) : IClassFixture<PostgresFixture>, IAsyncLifetime
{
    private static readonly DateTimeOffset T0 = DateTimeOffset.Parse("2026-09-24T10:00:00Z", System.Globalization.CultureInfo.InvariantCulture);
    private string _db = string.Empty;

    public async Task InitializeAsync()
    {
        _db = await pg.CreateDatabaseAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    /// <summary>Counts calls; the race itself is injected at save time by <see cref="RivalInterceptor"/>.</summary>
    private sealed class CountingPingProjection(ProjectDbContext db) : IProjection
    {
        private readonly PingProjection _inner = new(db, NullLogger<PingProjection>.Instance);

        public static int Calls { get; set; }

        public string Topic => _inner.Topic;

        public string GroupId => _inner.GroupId;

        public Task ApplyAsync(string key, string json, CancellationToken ct)
        {
            Calls++;
            return _inner.ApplyAsync(key, json, ct);
        }
    }

    /// <summary>
    /// Runs the rival once, after the projection has read "no row" and just before it saves: the exact
    /// interleaving of two consumers during a rebalance.
    /// </summary>
    private sealed class RivalInterceptor(Func<Task> rival) : SaveChangesInterceptor
    {
        private int _fired;

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (Interlocked.Exchange(ref _fired, 1) == 0)
            {
                await rival();
            }

            return result;
        }
    }

    [Fact]
    public async Task A_racing_first_insert_is_a_unique_violation_the_runner_absorbs()
    {
        string json = Event("p1", 1);
        await using (ProjectDbContext winner = Context())
        {
            winner.RmPings.Add(new RmPing { PingId = "p0", LastSeq = 1, Count = 1, UpdatedAt = T0 });
            await winner.SaveChangesAsync();
        }

        // First prove the raw shape: a second insert of the same key is 23505 and ConflictDetector says so.
        await using (ProjectDbContext loser = Context())
        {
            loser.RmPings.Add(new RmPing { PingId = "p0", LastSeq = 1, Count = 1, UpdatedAt = T0 });
            DbUpdateException e = await Assert.ThrowsAsync<DbUpdateException>(() => loser.SaveChangesAsync());
            Assert.True(ConflictDetector.IsConflict(e));
        }

        // Then the whole path: the rival applies seq 1 first; the runner's conflict retry must skip, not double-count.
        CountingPingProjection.Calls = 0;
        RivalInterceptor interceptor = new(async () =>
        {
            await using ProjectDbContext rival = Context();
            await new PingProjection(rival, NullLogger<PingProjection>.Instance).ApplyAsync("p1", json, CancellationToken.None);
        });
        ServiceCollection services = new();
        services.AddLogging();
        services.AddSingleton(TimeProvider.System);
        services.AddScoped(_ => Context(interceptor));
        services.AddScoped<IDeadLetterStore, DeadLetterStore>();
        services.AddScoped<CountingPingProjection>();
        await using ServiceProvider provider = services.BuildServiceProvider();
        ProjectionRunner runner = new(
            provider.GetRequiredService<IServiceScopeFactory>(),
            new ProjectionDeadLetterOptions { MaxAttempts = 1 },
            TimeProvider.System,
            NullLogger<ProjectionRunner>.Instance);

        await runner.RunAsync(typeof(CountingPingProjection), "chess.rm-pings", "p1", json, CancellationToken.None);

        await using ProjectDbContext check = Context();
        RmPing row = await check.RmPings.SingleAsync(p => p.PingId == "p1");
        Assert.Equal((1L, 1L), (row.Count, row.LastSeq));
        Assert.Equal(0, await check.ProjectionDeadLetters.CountAsync());
        Assert.Equal(2, CountingPingProjection.Calls); // lost the race once, then skipped
    }

    [Fact]
    public async Task A_stale_watermark_update_is_a_concurrency_conflict_on_postgres()
    {
        await using (ProjectDbContext seed = Context())
        {
            seed.RmPings.Add(new RmPing { PingId = "p2", LastSeq = 1, Count = 1, UpdatedAt = T0 });
            await seed.SaveChangesAsync();
        }

        await using ProjectDbContext first = Context();
        await using ProjectDbContext second = Context();
        RmPing a = await first.RmPings.SingleAsync(p => p.PingId == "p2");
        RmPing b = await second.RmPings.SingleAsync(p => p.PingId == "p2");
        (a.LastSeq, a.Count) = (2, 2);
        (b.LastSeq, b.Count) = (2, 2);
        await first.SaveChangesAsync();

        DbUpdateConcurrencyException e = await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => second.SaveChangesAsync());
        Assert.True(ConflictDetector.IsConflict(e));
    }

    [Fact]
    public async Task A_park_waits_for_the_aggregate_lock_held_by_a_replay_step()
    {
        await using NpgsqlConnection replayStep = new(_db);
        await replayStep.OpenAsync();
        await using NpgsqlTransaction tx = await replayStep.BeginTransactionAsync();
        await using (NpgsqlCommand hold = new("SELECT pg_advisory_xact_lock(hashtextextended('g:a', 0))", replayStep, tx))
        {
            await hold.ExecuteNonQueryAsync();
        }

        await using ProjectDbContext db = Context();
        DeadLetterStore store = new(db, NullLogger<DeadLetterStore>.Instance, TimeProvider.System);
        Task park = store.ParkAsync(new ParkRequest("g", "a", 1, "a", "{}", 5, "bug", T0), CancellationToken.None);

        await Task.Delay(TimeSpan.FromMilliseconds(750));
        Assert.False(park.IsCompleted, "the park must block while another transaction holds the (group, aggregate) lock");

        await tx.CommitAsync();
        await park.WaitAsync(TimeSpan.FromSeconds(10));
        await using ProjectDbContext check = Context();
        Assert.Equal(1, await check.ProjectionDeadLetters.CountAsync());
    }

    [Fact]
    public async Task Locks_on_different_aggregates_do_not_block_each_other()
    {
        await using NpgsqlConnection other = new(_db);
        await other.OpenAsync();
        await using NpgsqlTransaction tx = await other.BeginTransactionAsync();
        await using (NpgsqlCommand hold = new("SELECT pg_advisory_xact_lock(hashtextextended('g:b', 0))", other, tx))
        {
            await hold.ExecuteNonQueryAsync();
        }

        await using ProjectDbContext db = Context();
        DeadLetterStore store = new(db, NullLogger<DeadLetterStore>.Instance, TimeProvider.System);

        await store.ParkAsync(new ParkRequest("g", "a", 1, "a", "{}", 5, "bug", T0), CancellationToken.None)
            .WaitAsync(TimeSpan.FromSeconds(5));
        await tx.RollbackAsync();
    }

    private ProjectDbContext Context(IInterceptor? interceptor = null)
    {
        DbContextOptionsBuilder<ProjectDbContext> options = new DbContextOptionsBuilder<ProjectDbContext>().UseNpgsql(_db, o => o.EnableRetryOnFailure());
        if (interceptor is not null)
        {
            options.AddInterceptors(interceptor);
        }

        return new ProjectDbContext(options.Options);
    }

    private static string Event(string id, long seq) =>
        EventJson.Serialize(new EventEnvelope<Pinged>(EventTypes.Pinged, 1, id, seq, T0, new Pinged("x", 1, T0)));
}
