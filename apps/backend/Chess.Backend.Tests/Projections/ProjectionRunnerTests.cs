using Chess.Backend.Events;
using Chess.Backend.Projections;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.Tests.Projections;

public sealed class ProjectionRunnerTests
{
    private const string Group = "test.runner";
    private static readonly DateTimeOffset T0 = DateTimeOffset.Parse("2026-09-24T10:00:00Z", System.Globalization.CultureInfo.InvariantCulture);

    /// <summary>What the fake projection does on each call, in order; after the queue runs dry it succeeds.</summary>
    private sealed class Script
    {
        public Queue<Exception> Failures { get; } = new();

        public Exception? Always { get; set; }

        public int Calls { get; set; }
    }

    private sealed class ScriptedProjection(Script script) : IProjection
    {
        public string Topic => "game.events";

        public string GroupId => Group;

        public Task ApplyAsync(string key, string json, CancellationToken ct)
        {
            script.Calls++;
            if (script.Always is { } always)
            {
                throw always;
            }

            return script.Failures.TryDequeue(out Exception? e) ? Task.FromException(e) : Task.CompletedTask;
        }
    }

    private sealed class Harness
    {
        public Harness(int maxAttempts = 5)
        {
            string db = Guid.NewGuid().ToString("N");
            ServiceCollection services = new();
            services.AddLogging();
            services.AddSingleton(Script);
            services.AddSingleton<TimeProvider>(new FakeClock(T0));
            services.AddScoped(_ => TestDb.Create(name: db));
            services.AddScoped<IDeadLetterStore, DeadLetterStore>();
            services.AddScoped<ScriptedProjection>();
            Provider = services.BuildServiceProvider();
            Runner = new ProjectionRunner(
                Provider.GetRequiredService<IServiceScopeFactory>(),
                new ProjectionDeadLetterOptions { MaxAttempts = maxAttempts, BaseDelay = TimeSpan.FromMilliseconds(1), MaxDelay = TimeSpan.FromMilliseconds(2) },
                new FakeClock(T0),
                NullLogger<ProjectionRunner>.Instance);
        }

        public Script Script { get; } = new();

        public ServiceProvider Provider { get; }

        public ProjectionRunner Runner { get; }

        public Task RunAsync(string value, string key = "k", string group = Group, CancellationToken ct = default) =>
            Runner.RunAsync(typeof(ScriptedProjection), group, key, value, ct);

        public async Task<List<ProjectionDeadLetter>> ParkedAsync()
        {
            using IServiceScope scope = Provider.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<ProjectDbContext>().ProjectionDeadLetters.OrderBy(d => d.Seq).ToListAsync();
        }

        public async Task SeedParkedAsync(string group, string aggregateId, long seq)
        {
            using IServiceScope scope = Provider.CreateScope();
            await scope.ServiceProvider.GetRequiredService<IDeadLetterStore>()
                .ParkAsync(new ParkRequest(group, aggregateId, seq, aggregateId, "{}", 5, "seeded", T0), CancellationToken.None);
        }
    }

    private static string Event(string id, long seq) =>
        EventJson.Serialize(new EventEnvelope<Pinged>(EventTypes.Pinged, 1, id, seq, T0, new Pinged("x", 1, T0)));

    [Fact]
    public async Task A_transient_failure_recovers_before_the_limit_and_nothing_is_parked()
    {
        Harness h = new();
        h.Script.Failures.Enqueue(new InvalidOperationException("one"));
        h.Script.Failures.Enqueue(new InvalidOperationException("two"));

        await h.RunAsync(Event("a", 1));

        Assert.Equal(3, h.Script.Calls);
        Assert.Empty(await h.ParkedAsync());
    }

    [Fact]
    public async Task A_poison_event_is_parked_after_exactly_max_attempts_and_the_run_returns()
    {
        Harness h = new();
        h.Script.Always = new InvalidOperationException("bug in projection");

        await h.RunAsync(Event("a", 7), key: "a"); // must return normally so the host commits the offset

        Assert.Equal(5, h.Script.Calls);
        ProjectionDeadLetter parked = Assert.Single(await h.ParkedAsync());
        Assert.Equal((Group, "a", 7L, "a", 5), (parked.GroupId, parked.AggregateId, parked.Seq, parked.KafkaKey, parked.Attempts));
        Assert.Contains("InvalidOperationException: bug in projection", parked.LastError, StringComparison.Ordinal);
        Assert.Equal(Event("a", 7), parked.Value);
    }

    [Fact]
    public async Task A_quarantined_aggregate_is_parked_without_calling_the_projection()
    {
        Harness h = new();
        await h.SeedParkedAsync(Group, "a", 7);

        await h.RunAsync(Event("a", 8));

        Assert.Equal(0, h.Script.Calls);
        ProjectionDeadLetter behind = (await h.ParkedAsync())[1];
        Assert.Equal((8L, 0), (behind.Seq, behind.Attempts));
    }

    [Fact]
    public async Task Quarantine_in_one_group_does_not_affect_another()
    {
        Harness h = new();
        await h.SeedParkedAsync("other.group", "a", 7);

        await h.RunAsync(Event("a", 8));

        Assert.Equal(1, h.Script.Calls);
        Assert.Single(await h.ParkedAsync());
    }

    [Fact]
    public async Task A_gap_is_rethrown_on_the_first_call_and_never_parked()
    {
        Harness h = new(maxAttempts: 1);
        h.Script.Always = new ProjectionGapException(Group, "a", 3, 5);

        await Assert.ThrowsAsync<ProjectionGapException>(() => h.RunAsync(Event("a", 5)));
        await Assert.ThrowsAsync<ProjectionGapException>(() => h.RunAsync(Event("a", 5)));

        Assert.Equal(2, h.Script.Calls);
        Assert.Empty(await h.ParkedAsync());
    }

    [Fact]
    public async Task A_conflict_is_retried_in_place_and_is_not_an_attempt()
    {
        Harness h = new(maxAttempts: 1); // one real failure would park; the conflict must not count
        h.Script.Failures.Enqueue(new DbUpdateConcurrencyException("lost the race"));

        await h.RunAsync(Event("a", 2));

        Assert.Equal(2, h.Script.Calls);
        Assert.Empty(await h.ParkedAsync());
    }

    [Fact]
    public async Task Four_consecutive_conflicts_count_as_one_failed_attempt()
    {
        Harness h = new(maxAttempts: 1);
        for (int i = 0; i < 4; i++)
        {
            h.Script.Failures.Enqueue(new DbUpdateConcurrencyException("lost again"));
        }

        await h.RunAsync(Event("a", 2));

        Assert.Equal(4, h.Script.Calls);
        Assert.Equal(1, Assert.Single(await h.ParkedAsync()).Attempts);
    }

    [Fact]
    public async Task An_unreadable_value_that_keeps_failing_is_parked_under_the_kafka_key_with_seq_0()
    {
        Harness h = new();
        h.Script.Always = new FormatException("not an envelope");

        await h.RunAsync("garbage", key: "game-42");

        ProjectionDeadLetter parked = Assert.Single(await h.ParkedAsync());
        Assert.Equal(("game-42", 0L, "garbage"), (parked.AggregateId, parked.Seq, parked.Value));
    }

    [Fact]
    public async Task Cancellation_propagates_and_nothing_is_parked()
    {
        Harness h = new();
        using CancellationTokenSource cts = new();
        await cts.CancelAsync();
        h.Script.Always = new OperationCanceledException(cts.Token);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => h.RunAsync(Event("a", 1), ct: cts.Token));

        Assert.Empty(await h.ParkedAsync());
    }
}
