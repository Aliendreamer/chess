using System.Text.Json;
using Chess.Backend.Events;

namespace Chess.Backend.Projections;

internal sealed class ProjectionDeadLetterOptions
{
    public const string SectionName = "Projections:DeadLetter";

    /// <summary>Failed attempts at one record before it is parked and its aggregate quarantined.</summary>
    public int MaxAttempts { get; set; } = 5;

    /// <summary>Wait after the first failure; doubles per attempt up to <see cref="MaxDelay"/>.</summary>
    public TimeSpan BaseDelay { get; set; } = TimeSpan.FromMilliseconds(200);

    public TimeSpan MaxDelay { get; set; } = TimeSpan.FromSeconds(5);

    /// <summary>Lost watermark races re-run in place this many times before one more counts as a failure.</summary>
    public int MaxConflictRetries { get; set; } = 3;
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
    public async Task RunAsync(Type projectionType, string groupId, string key, string value, CancellationToken ct)
    {
        (string aggregateId, long seq) = Identify(key, value);
        if (await ParkedBehindQuarantineAsync(groupId, aggregateId, seq, key, value, ct))
        {
            Log.ProjectionParkedBehindQuarantine(logger, groupId, aggregateId, seq);
            return;
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
                await projection.ApplyAsync(key, value, ct);
                return;
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
                    return;
                }

                Log.ProjectionAttemptFailed(logger, e, groupId, aggregateId, seq, attempts);
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
        IDeadLetterStore store = scope.ServiceProvider.GetRequiredService<IDeadLetterStore>();
        // Cheap unlocked check first: the healthy path pays one indexed EXISTS and never takes the lock (design D5).
        return await store.IsQuarantinedAsync(groupId, aggregateId, ct)
            && await store.ParkIfQuarantinedAsync(new ParkRequest(groupId, aggregateId, seq, key, value, 0, "parked behind quarantine", clock.GetUtcNow()), ct);
    }

    private async Task ParkAsync(ParkRequest request, CancellationToken ct)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IDeadLetterStore>().ParkAsync(request, ct);
    }
}
