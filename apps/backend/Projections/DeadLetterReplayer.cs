namespace Chess.Backend.Projections;

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
