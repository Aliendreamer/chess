using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using Chess.Backend.Akka;
using Chess.Backend.Projections;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.Tests.Projections;

public sealed class ProjectionRunnerTests
{
    private const string Group = "test.runner";

    /// <summary>What the fake projection does on each call, in order; after the queue runs dry it succeeds.</summary>
    private sealed class Script
    {
        public Queue<Exception> Failures { get; } = new();

        public Exception? Always { get; set; }

        public int Calls { get; set; }

        /// <summary>When set, the projection asks the idempotency guard about (last seq, seq), as real projections do.</summary>
        public (long Last, long Seq)? Decide { get; set; }
    }

    private sealed class ScriptedProjection(Script script) : IProjection
    {
        public string Topic => "game.events";

        public string GroupId => Group;

        public Task<ProjectionOutcome> ApplyAsync(string key, string json, CancellationToken ct)
        {
            script.Calls++;
            ProjectionOutcome outcome = script.Decide is { } d && IdempotencyGuard.Decide(d.Last, d.Seq) == SeqDecision.Skip
                ? ProjectionOutcome.Skipped
                : ProjectionOutcome.Applied;

            if (script.Always is { } always)
            {
                throw always;
            }

            return script.Failures.TryDequeue(out Exception? e) ? Task.FromException<ProjectionOutcome>(e) : Task.FromResult(outcome);
        }
    }

    private sealed class Harness
    {
        public Harness(int maxAttempts = 5)
        {
            Host = new ProjectionHost(services =>
            {
                services.AddSingleton(Script);
                services.AddScoped<ScriptedProjection>();
            });
            Runner = new ProjectionRunner(
                Host.Provider.GetRequiredService<IServiceScopeFactory>(),
                new ProjectionDeadLetterOptions { MaxAttempts = maxAttempts, BaseDelay = TimeSpan.FromMilliseconds(1), MaxDelay = TimeSpan.FromMilliseconds(2) },
                new FakeClock(ProjectionHost.T0),
                NullLogger<ProjectionRunner>.Instance);
        }

        public Script Script { get; } = new();

        public ProjectionHost Host { get; }

        public ProjectionRunner Runner { get; }

        public Task RunAsync(string value, string key = "k", string group = Group, string? traceParent = null, CancellationToken ct = default) =>
            Runner.RunAsync(typeof(ScriptedProjection), group, key, value, traceParent, ct);

        public Task<List<ProjectionDeadLetter>> ParkedAsync() =>
            Host.WithDbAsync(db => db.ProjectionDeadLetters.OrderBy(d => d.Seq).ToListAsync());

        public Task SeedParkedAsync(string group, string aggregateId, long seq) => Host.ParkAsync(group, aggregateId, seq);
    }

    private static string Event(string id, long seq) => Envelopes.Pinged(id, seq, at: ProjectionHost.T0);

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

    /// <summary>Records the runner's spans for one trace, so tests running in parallel never see each other's.</summary>
    private sealed class Spans : IDisposable
    {
        private readonly ConcurrentQueue<Activity> _stopped = new();
        private readonly ActivityListener _listener;

        public Spans()
        {
            _listener = new ActivityListener
            {
                ShouldListenTo = source => source.Name == PipelineTracing.SourceName,
                Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
                ActivityStopped = _stopped.Enqueue,
            };
            ActivitySource.AddActivityListener(_listener);
        }

        public ActivityTraceId TraceId { get; } = ActivityTraceId.CreateRandom();

        public string Parent => $"00-{TraceId.ToHexString()}-b7ad6b7169203331-01";

        public Activity Consume => Assert.Single(_stopped, a => a.TraceId == TraceId);

        public void Dispose() => _listener.Dispose();
    }

    [Fact]
    public async Task A_record_is_projected_in_a_consume_span_continuing_its_trace()
    {
        using Spans spans = new();
        Harness h = new();

        await h.RunAsync(Event("a", 1), traceParent: spans.Parent);

        Activity consume = spans.Consume;
        Assert.Equal($"consume {Group}", consume.OperationName);
        Assert.Equal(ActivityKind.Consumer, consume.Kind);
        Assert.Equal("b7ad6b7169203331", consume.ParentSpanId.ToHexString());
        Assert.Equal("applied", consume.GetTagItem("projection.outcome"));
    }

    [Fact]
    public async Task A_redelivered_record_is_named_skipped_by_the_idempotency_guard()
    {
        using Spans spans = new();
        Harness h = new();
        h.Script.Decide = (5, 3);

        await h.RunAsync(Event("a", 3), traceParent: spans.Parent);

        Assert.Equal("skipped", spans.Consume.GetTagItem("projection.outcome"));
    }

    [Fact]
    public async Task A_redelivered_record_is_counted_skipped_with_tracing_off()
    {
        const string group = "test.runner.untraced";
        List<string?> outcomes = [];
        using MeterListener listener = new();
        listener.InstrumentPublished = (instrument, l) =>
        {
            if (instrument.Meter.Name == PipelineMetrics.MeterName && instrument.Name == "chess.projection.records")
            {
                l.EnableMeasurementEvents(instrument);
            }
        };
        listener.SetMeasurementEventCallback<long>((_, _, tags, _) =>
        {
            Dictionary<string, object?> t = tags.ToArray().ToDictionary(k => k.Key, k => k.Value);
            if (Equals(t["group"], group))
            {
                outcomes.Add(t["outcome"] as string);
            }
        });
        listener.Start();
        Harness h = new();
        h.Script.Decide = (5, 3);

        await h.RunAsync(Event("a", 3), group: group);

        Assert.Equal(["skipped"], outcomes);
    }

    [Fact]
    public async Task Retries_parking_and_gaps_are_named_on_the_span()
    {
        using Spans parked = new();
        Harness failing = new(maxAttempts: 2);
        failing.Script.Always = new InvalidOperationException("broken");
        await failing.RunAsync(Event("a", 1), traceParent: parked.Parent);

        using Spans gap = new();
        Harness gapped = new(maxAttempts: 1);
        gapped.Script.Always = new ProjectionGapException(Group, "b", 3, 5);
        await Assert.ThrowsAsync<ProjectionGapException>(() => gapped.RunAsync(Event("b", 5), traceParent: gap.Parent));

        Assert.Equal("parked", parked.Consume.GetTagItem("projection.outcome"));
        Assert.Single(parked.Consume.Events, e => e.Name == "retry");
        Assert.Equal("gap", gap.Consume.GetTagItem("projection.outcome"));
        Assert.Equal(ActivityStatusCode.Error, gap.Consume.Status);
    }
}
