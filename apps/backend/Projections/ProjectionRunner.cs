using System.Diagnostics;
using System.Text.Json;
using Chess.Backend.Akka;
using Chess.Backend.Events;
using Npgsql;

namespace Chess.Backend.Projections;

internal sealed class ProjectionDeadLetterOptions : Extensions.ISettings
{
    public const string SectionName = "Projections:DeadLetter";

    /// <summary>Failed attempts at one record before it is parked and its aggregate quarantined.</summary>
    public int MaxAttempts { get; set; } = 5;

    /// <summary>Wait after the first failure; doubles per attempt up to <see cref="MaxDelay"/>.</summary>
    public TimeSpan BaseDelay { get; set; } = TimeSpan.FromMilliseconds(200);

    public TimeSpan MaxDelay { get; set; } = TimeSpan.FromSeconds(5);

    /// <summary>Lost watermark races re-run in place this many times before one more counts as a failure.</summary>
    public int MaxConflictRetries { get; set; } = 3;

    public void Validate()
    {
        if (MaxAttempts <= 0 || BaseDelay <= TimeSpan.Zero || MaxDelay < BaseDelay || MaxConflictRetries < 0)
        {
            throw new InvalidOperationException(
                "Projections:DeadLetter:MaxAttempts and BaseDelay must be positive, MaxDelay at least BaseDelay, MaxConflictRetries not negative.");
        }
    }
}

/// <summary>
/// Decides what happens to one Kafka record for one projection (design D1), with no broker in sight so it can be
/// unit-tested. A quarantined aggregate is parked without calling the projection. Otherwise the record is applied
/// in a fresh scope: a lost watermark race re-runs it in place (it then skips) and is not a failure, a gap or
/// cancellation propagates to the stream's restart loop, and any other exception is retried with backoff and
/// parked after <see cref="ProjectionDeadLetterOptions.MaxAttempts"/>. Returning normally means "commit the offset".
/// </summary>
internal sealed class ProjectionRunner(
    IServiceScopeFactory scopes,
    ProjectionDeadLetterOptions options,
    TimeProvider clock,
    ILogger<ProjectionRunner> logger)
{
    /// <summary>
    /// Every attempt at the record runs inside one <c>consume {group}</c> span continuing <paramref name="traceParent"/>
    /// (observability D5), tagged with its <see cref="ProjectionOutcome"/>; each failed attempt is a <c>retry</c> event on it.
    /// </summary>
    public async Task RunAsync(Type projectionType, string groupId, string key, string value, string? traceParent, CancellationToken ct)
    {
        (string aggregateId, long seq) = Identify(key, value);
        long started = Stopwatch.GetTimestamp();
        using Activity? consume = PipelineTracing.StartConsume(groupId, traceParent);
        consume?.SetTag(TelemetryTags.ProjectionAggregate, aggregateId);
        consume?.SetTag(TelemetryTags.ProjectionSeq, seq);
        try
        {
            // Never inline the call into `consume?.SetTag(...)`: with tracing off the whole call, work included, would be skipped.
            ProjectionOutcome outcome = await RunAttemptsAsync(projectionType, groupId, key, value, aggregateId, seq, ct);
            consume?.SetTag(TelemetryTags.ProjectionOutcome, outcome.Label());
            PipelineMetrics.Projected(groupId, outcome, Stopwatch.GetElapsedTime(started));
        }
        catch (ProjectionGapException e)
        {
            PipelineMetrics.Projected(groupId, ProjectionOutcome.Gap, Stopwatch.GetElapsedTime(started));
            consume?.SetTag(TelemetryTags.ProjectionOutcome, ProjectionOutcome.Gap.Label());
            consume?.SetStatus(ActivityStatusCode.Error, e.Message);
            throw;
        }
    }

    private async Task<ProjectionOutcome> RunAttemptsAsync(Type projectionType, string groupId, string key, string value, string aggregateId, long seq, CancellationToken ct)
    {
        if (await ParkedBehindQuarantineAsync(groupId, aggregateId, seq, key, value, ct))
        {
            Log.ProjectionParkedBehindQuarantine(logger, groupId, aggregateId, seq);
            return ProjectionOutcome.Parked;
        }

        int attempts = 0;
        int conflicts = 0;
        DateTimeOffset? firstFailedAt = null;
        while (true)
        {
            try
            {
                await using AsyncServiceScope scope = scopes.CreateAsyncScope();
                IProjection projection = (IProjection)scope.ServiceProvider.GetRequiredService(projectionType);
                return await projection.ApplyAsync(key, value, ct);
            }
            catch (ProjectionGapException)
            {
                throw;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception e) when (ConflictDetector.IsConflict(e) && conflicts < options.MaxConflictRetries)
            {
                conflicts++;
            }
            catch (Exception e)
            {
                conflicts = 0;
                attempts++;
                firstFailedAt ??= clock.GetUtcNow();
                if (attempts >= options.MaxAttempts)
                {
                    await ParkAsync(new ParkRequest(groupId, aggregateId, seq, key, value, attempts, Describe(e), firstFailedAt.Value), ct);
                    Log.ProjectionParked(logger, e, groupId, aggregateId, seq, attempts);
                    return ProjectionOutcome.Parked;
                }

                Log.ProjectionAttemptFailed(logger, e, groupId, aggregateId, seq, attempts);
                Activity.Current?.AddEvent(new ActivityEvent("retry", tags: new ActivityTagsCollection { ["attempt"] = attempts, ["error"] = Describe(e) }));
                await Task.Delay(Backoff(attempts), clock, ct);
            }
        }
    }

    /// <summary>Envelope identity when the value has one; otherwise the Kafka key (topics are keyed by aggregate) and seq 0.</summary>
    internal static (string AggregateId, long Seq) Identify(string key, string value) =>
        EventJson.TryDeserialize(value, out EventEnvelope<JsonElement>? e) ? (e.AggregateId, e.Seq) : (key, 0);

    private TimeSpan Backoff(int attempt)
    {
        double ms = options.BaseDelay.TotalMilliseconds * Math.Pow(2, attempt - 1);
        return TimeSpan.FromMilliseconds(Math.Min(ms, options.MaxDelay.TotalMilliseconds));
    }

    private static string Describe(Exception e) => $"{e.GetType().FullName}: {e.Message}";

    private async Task<bool> ParkedBehindQuarantineAsync(string groupId, string aggregateId, long seq, string key, string value, CancellationToken ct)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        IDeadLetterService deadLetters = scope.ServiceProvider.GetRequiredService<IDeadLetterService>();
        // Cheap unlocked check first: the healthy path pays one indexed EXISTS and never takes the lock (design D5).
        return await deadLetters.IsQuarantinedAsync(groupId, aggregateId, ct)
            && await deadLetters.ParkIfQuarantinedAsync(new ParkRequest(groupId, aggregateId, seq, key, value, 0, "parked behind quarantine", clock.GetUtcNow()), ct);
    }

    private async Task ParkAsync(ParkRequest request, CancellationToken ct)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IDeadLetterService>().ParkAsync(request, ct);
    }
}

/// <summary>
/// Recognises a lost race on a projection watermark (design D2): a stale <c>UPDATE … WHERE "LastSeq" = @original</c>
/// that hit zero rows, or two consumers inserting the first row for the same aggregate. Either way the event was
/// already applied by the winner, so the caller re-runs it on a fresh context and the idempotency guard skips it.
/// </summary>
internal static class ConflictDetector
{
    public static bool IsConflict(Exception exception) => exception switch
    {
        DbUpdateConcurrencyException => true,
        DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } } => true,
        _ => false,
    };
}

/// <summary>
/// What became of one record: the <c>projection.outcome</c> span tag and the <c>outcome</c> label of
/// <c>chess.projection.records</c>. A projection answers the first three; the runner adds the last two.
/// </summary>
internal enum ProjectionOutcome
{
    /// <summary>The record changed the read model.</summary>
    Applied,

    /// <summary>The idempotency guard had seen it already.</summary>
    Skipped,

    /// <summary>Not this projection's (another aggregate or event type on the topic) or unreadable.</summary>
    Ignored,

    /// <summary>Dead-lettered: out of attempts, or behind a quarantined record of its aggregate.</summary>
    Parked,

    /// <summary>An earlier seq never arrived; the stream stalls and restarts.</summary>
    Gap,
}

internal static class ProjectionOutcomes
{
    /// <summary>The lower-case label dashboards query (<c>outcome="gap"</c>), spelled once.</summary>
    public static string Label(this ProjectionOutcome outcome) => outcome switch
    {
        ProjectionOutcome.Applied => "applied",
        ProjectionOutcome.Skipped => "skipped",
        ProjectionOutcome.Ignored => "ignored",
        ProjectionOutcome.Parked => "parked",
        ProjectionOutcome.Gap => "gap",
        _ => throw new ArgumentOutOfRangeException(nameof(outcome), outcome, null),
    };
}

internal enum SeqDecision
{
    /// <summary>The next event for this aggregate: apply it.</summary>
    Apply,

    /// <summary>Already applied (redelivery, publisher restart, deliberate replay): skip it.</summary>
    Skip,

    /// <summary>An earlier event never arrived: stop rather than apply out of order.</summary>
    Gap,
}

/// <summary>
/// The one rule every Kafka consumer applies (design D10): a per-(consumer, aggregate) high-water mark on the
/// journal <c>seq</c>. With a single ordered publisher and key partitioning a consumer can only ever see
/// <c>last + 1</c> or something it already has; anything further ahead means an event was lost upstream, and
/// the consumer stalls on it instead of producing a silently wrong read model.
/// </summary>
internal static class IdempotencyGuard
{
    public static SeqDecision Decide(long lastSeq, long seq) =>
        seq <= lastSeq ? SeqDecision.Skip
        : seq == lastSeq + 1 ? SeqDecision.Apply
        : SeqDecision.Gap;
}

internal sealed class ProjectionGapException : Exception
{
    public ProjectionGapException(string groupId, string aggregateId, long lastSeq, long seq)
        : base($"{groupId}: gap for {aggregateId} — expected seq {lastSeq + 1}, got {seq}; stalling instead of skipping.")
    {
    }

    public ProjectionGapException()
    {
    }

    public ProjectionGapException(string message) : base(message)
    {
    }

    public ProjectionGapException(string message, Exception innerException) : base(message, innerException)
    {
    }
}
