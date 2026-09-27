using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Chess.Backend.Projections;

/// <summary>What the runner hands over when it parks a record.</summary>
internal sealed record ParkRequest(
    string GroupId,
    string AggregateId,
    long Seq,
    string KafkaKey,
    string Value,
    int Attempts,
    string Error,
    DateTimeOffset FirstFailedAt);

internal interface IDeadLetterStore : IService
{
    /// <summary>True when the aggregate has at least one parked record for this consumer group.</summary>
    Task<bool> IsQuarantinedAsync(string groupId, string aggregateId, CancellationToken ct);

    /// <summary>Parks a record under the aggregate lock, which quarantines the aggregate if it wasn't already.</summary>
    Task ParkAsync(ParkRequest request, CancellationToken ct);

    /// <summary>
    /// Under the aggregate lock, re-checks the quarantine and parks the record only if it still holds. False means a
    /// replay lifted it in the meantime, and the caller should apply the record normally.
    /// </summary>
    Task<bool> ParkIfQuarantinedAsync(ParkRequest request, CancellationToken ct);

    /// <summary>The aggregate's parked record with the lowest seq, or null when none is left.</summary>
    Task<ProjectionDeadLetter?> NextAsync(string groupId, string aggregateId, CancellationToken ct);

    Task DeleteAsync(ProjectionDeadLetter row, CancellationToken ct);

    /// <summary>Distinct quarantined aggregates per consumer group; groups with none are absent.</summary>
    Task<IReadOnlyDictionary<string, int>> CountsAsync(CancellationToken ct);

    /// <summary>
    /// Runs <paramref name="body"/> in a transaction holding <c>pg_advisory_xact_lock</c> on the
    /// <c>(group, aggregate)</c> pair (design D5), so a park and a replay step never interleave. The lock goes with
    /// the transaction. On a non-relational provider (unit tests) the body just runs.
    /// </summary>
    Task<T> WithAggregateLockAsync<T>(string groupId, string aggregateId, Func<CancellationToken, Task<T>> body, CancellationToken ct);
}

internal sealed class DeadLetterStore(ProjectDbContext context, ILogger<DeadLetterStore> logger, TimeProvider clock)
    : BaseService(context, logger), IDeadLetterStore
{
    public const int MaxErrorLength = 2000;

    public Task<bool> IsQuarantinedAsync(string groupId, string aggregateId, CancellationToken ct) =>
        Context.ProjectionDeadLetters.AnyAsync(d => d.GroupId == groupId && d.AggregateId == aggregateId, ct);

    public Task ParkAsync(ParkRequest request, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);
        return WithAggregateLockAsync(request.GroupId, request.AggregateId, async c =>
        {
            await InsertAsync(request, c);
            return true;
        }, ct);
    }

    public Task<bool> ParkIfQuarantinedAsync(ParkRequest request, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);
        return WithAggregateLockAsync(request.GroupId, request.AggregateId, async c =>
        {
            if (!await IsQuarantinedAsync(request.GroupId, request.AggregateId, c))
            {
                return false;
            }

            await InsertAsync(request, c);
            return true;
        }, ct);
    }

    public Task<ProjectionDeadLetter?> NextAsync(string groupId, string aggregateId, CancellationToken ct) =>
        Context.ProjectionDeadLetters
            .Where(d => d.GroupId == groupId && d.AggregateId == aggregateId)
            .OrderBy(d => d.Seq)
            .ThenBy(d => d.Id)
            .FirstOrDefaultAsync(ct);

    public async Task DeleteAsync(ProjectionDeadLetter row, CancellationToken ct)
    {
        Context.ProjectionDeadLetters.Remove(row);
        await Context.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyDictionary<string, int>> CountsAsync(CancellationToken ct) =>
        await Context.ProjectionDeadLetters
            .GroupBy(d => d.GroupId)
            .Select(g => new { g.Key, Count = g.Select(d => d.AggregateId).Distinct().Count() })
            .ToDictionaryAsync(g => g.Key, g => g.Count, ct);

    public async Task<T> WithAggregateLockAsync<T>(string groupId, string aggregateId, Func<CancellationToken, Task<T>> body, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(body);
        if (!Context.Database.IsRelational())
        {
            return await body(ct);
        }

        // EnableRetryOnFailure forbids user transactions outside the execution strategy; a retry re-runs the whole
        // unit, which is safe because parking re-checks under the lock and replay steps are idempotent by seq.
        return await Context.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction tx = await Context.Database.BeginTransactionAsync(ct);
            string lockKey = $"{groupId}:{aggregateId}";
            await Context.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))", ct);
            T result = await body(ct);
            await tx.CommitAsync(ct);
            return result;
        });
    }

    private async Task InsertAsync(ParkRequest request, CancellationToken ct)
    {
        Context.ProjectionDeadLetters.Add(new ProjectionDeadLetter
        {
            Id = Guid.CreateVersion7(),
            GroupId = request.GroupId,
            AggregateId = request.AggregateId,
            Seq = request.Seq,
            KafkaKey = request.KafkaKey,
            Value = request.Value,
            Attempts = request.Attempts,
            LastError = request.Error.Length > MaxErrorLength ? request.Error[..MaxErrorLength] : request.Error,
            FirstFailedAt = request.FirstFailedAt,
            ParkedAt = clock.GetUtcNow(),
        });
        await Context.SaveChangesAsync(ct);
    }
}

internal enum ReplayStatus
{
    /// <summary>Nothing is parked for the aggregate any more; its quarantine is lifted.</summary>
    Completed,

    /// <summary>A parked record failed again; it and everything after it stay parked.</summary>
    Failed,

    /// <summary>No registered projection has this consumer group id.</summary>
    UnknownGroup,
}

internal sealed record ReplayResult(ReplayStatus Status, int Applied, string? Error = null);

internal interface IDeadLetterReplayer : IService
{
    Task<ReplayResult> ReplayAsync(string groupId, string aggregateId, CancellationToken ct);
}

/// <summary>
/// Feeds one aggregate's parked records back through the projection that owns <c>groupId</c>, lowest seq first
/// (design D7). Each step holds the aggregate lock, applies one record in a fresh scope and deletes it only
/// after it applied. A crash between the two re-applies it next time, and the idempotency guard skips it. The
/// first failure stops the replay: order matters more than progress, so nothing after it is attempted.
/// </summary>
internal sealed class DeadLetterReplayer(
    ProjectDbContext context,
    ILogger<DeadLetterReplayer> logger,
    IDeadLetterStore store,
    IServiceScopeFactory scopes) : BaseService(context, logger), IDeadLetterReplayer
{
    private enum Step
    {
        Applied,
        Done,
        Failed,
    }

    public async Task<ReplayResult> ReplayAsync(string groupId, string aggregateId, CancellationToken ct)
    {
        Type? projectionType = await FindProjectionTypeAsync(groupId);
        if (projectionType is null)
        {
            return new ReplayResult(ReplayStatus.UnknownGroup, 0);
        }

        int applied = 0;
        while (true)
        {
            string? error = null;
            Step step = await store.WithAggregateLockAsync(groupId, aggregateId, async c =>
            {
                ProjectionDeadLetter? row = await store.NextAsync(groupId, aggregateId, c);
                if (row is null)
                {
                    return Step.Done;
                }

                try
                {
                    await using AsyncServiceScope scope = scopes.CreateAsyncScope();
                    await ((IProjection)scope.ServiceProvider.GetRequiredService(projectionType)).ApplyAsync(row.KafkaKey, row.Value, c);
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    error = $"{e.GetType().FullName}: {e.Message} (seq {row.Seq})";
                    return Step.Failed;
                }

                await store.DeleteAsync(row, c);
                return Step.Applied;
            }, ct);

            switch (step)
            {
                case Step.Applied:
                    applied++;
                    continue;
                case Step.Done:
                    Log.ProjectionReplayed(Logger, groupId, aggregateId, applied, lifted: true);
                    return new ReplayResult(ReplayStatus.Completed, applied);
                default:
                    Log.ProjectionReplayed(Logger, groupId, aggregateId, applied, lifted: false);
                    return new ReplayResult(ReplayStatus.Failed, applied, error);
            }
        }
    }

    private async Task<Type?> FindProjectionTypeAsync(string groupId)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        return scope.ServiceProvider.GetServices<IProjection>().FirstOrDefault(p => p.GroupId == groupId)?.GetType();
    }
}

/// <summary>
/// Quarantined aggregates per consumer group on <c>/health</c> (design D8). Never Unhealthy: one parked game means
/// its lists are stale, not that the API is down, and every other aggregate is still flowing.
/// </summary>
internal sealed class DeadLetterHealthCheck(IDeadLetterStore store) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        IReadOnlyDictionary<string, int> counts = await store.CountsAsync(cancellationToken);
        if (counts.Count == 0)
        {
            return HealthCheckResult.Healthy("No quarantined aggregates.");
        }

        Dictionary<string, object> data = counts.ToDictionary(c => c.Key, c => (object)c.Value, StringComparer.Ordinal);
        return HealthCheckResult.Degraded($"{counts.Values.Sum()} quarantined aggregate(s); replay after fixing.", data: data);
    }
}
