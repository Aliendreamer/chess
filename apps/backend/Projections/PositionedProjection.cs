using Chess.Backend.Events;

namespace Chess.Backend.Projections;

/// <summary>
/// Base for a consumer with no per-aggregate row to hold its own watermark (notifications, analysis requests,
/// fan-out). Tracks the position in <c>consumer_positions</c>; <see cref="StageAsync"/> only stages changes on
/// <see cref="Db"/> and the base saves them together with the new position in one SaveChanges.
/// </summary>
internal abstract class PositionedProjection<TPayload>(ProjectDbContext db, ILogger<PositionedProjection<TPayload>> logger) : IProjection
{
    public abstract string Topic { get; }

    public abstract string GroupId { get; }

    protected ProjectDbContext Db { get; } = db;

    /// <summary>The envelope <c>type</c> this consumer handles; everything else on the topic is ignored.</summary>
    protected abstract string EventType { get; }

    public async Task ApplyAsync(string key, string json, CancellationToken ct)
    {
        if (!EventJson.TryDeserialize(json, out EventEnvelope<TPayload>? e) || e.Type != EventType)
        {
            return;
        }

        ConsumerPosition? position = await Db.ConsumerPositions.SingleOrDefaultAsync(p => p.GroupId == GroupId && p.AggregateId == e.AggregateId, ct);
        switch (IdempotencyGuard.Decide(position?.LastSeq ?? 0, e.Seq))
        {
            case SeqDecision.Skip:
                Log.ProjectionSkippedReplay(logger, e.AggregateId, e.Seq);
                return;
            case SeqDecision.Gap:
                Log.ProjectionGap(logger, GroupId, e.AggregateId, position?.LastSeq ?? 0, e.Seq);
                throw new ProjectionGapException(GroupId, e.AggregateId, position?.LastSeq ?? 0, e.Seq);
        }

        await StageAsync(e, ct);
        if (position is null)
        {
            position = new ConsumerPosition { GroupId = GroupId, AggregateId = e.AggregateId };
            Db.ConsumerPositions.Add(position);
        }

        position.LastSeq = e.Seq;
        position.UpdatedAt = e.At;
        await Db.SaveChangesAsync(ct);
    }

    /// <summary>Stage the effect of <paramref name="e"/> on <see cref="Db"/>; do NOT call SaveChanges.</summary>
    protected abstract Task StageAsync(EventEnvelope<TPayload> e, CancellationToken ct);
}
