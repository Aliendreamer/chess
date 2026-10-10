using System.Text.Json;
using Chess.Backend.Akka.Outbox;
using Chess.Backend.Events;
using Chess.Backend.Games;
using Chess.Backend.Projections;
using Chess.Backend.Review;

namespace Chess.Backend.Training;

/// <summary>
/// Reviews every game that ends (training D2): on <c>game.ended</c> — not an abort, at least two moves — it starts the
/// review as a player's button would. It reads <c>game.events</c> like any projection, with its watermark per game in
/// <c>consumer_positions</c>, so every event of a game is guarded and a replay starts nothing twice (a second start only
/// re-asks positions lost on the way). The game's read model on the primary must have reached the end first: until it
/// has, the record throws and the runner retries it.
/// </summary>
internal sealed class AutoReviewConsumer(ProjectDbContext db, IReviewService reviews, ILogger<AutoReviewConsumer> logger) : IProjection
{
    public string Topic => GameTopics.Kafka;

    public string GroupId => ConsumerGroups.AutoReview;

    public async Task<ProjectionOutcome> ApplyAsync(string key, string json, CancellationToken ct)
    {
        if (!EventJson.TryDeserialize(json, out EventEnvelope<JsonElement>? e)
            || !e.Type.StartsWith(GameEventTypes.Prefix, StringComparison.Ordinal)
            || !Guid.TryParseExact(e.AggregateId, "N", out Guid gameId))
        {
            return ProjectionOutcome.Ignored; // pings share the topic
        }

        ConsumerPosition? position = await db.ConsumerPositions.SingleOrDefaultAsync(p => p.GroupId == GroupId && p.AggregateId == e.AggregateId, ct);
        switch (IdempotencyGuard.Decide(position?.LastSeq ?? 0, e.Seq))
        {
            case SeqDecision.Skip:
                return ProjectionOutcome.Skipped;
            case SeqDecision.Gap:
                Log.ProjectionGap(logger, GroupId, e.AggregateId, position?.LastSeq ?? 0, e.Seq);
                throw new ProjectionGapException(GroupId, e.AggregateId, position?.LastSeq ?? 0, e.Seq);
        }

        if (e.Type == GameEventTypes.Ended
            && e.Payload.Deserialize<GameEnded>() is { } ended
            && EndReasons.Parse(ended.Reason) != EndReason.Aborted
            && await reviews.StartAutomaticAsync(gameId, e.Seq, ct))
        {
            Log.AutoReviewStarted(logger, gameId);
        }

        if (position is null)
        {
            position = new ConsumerPosition { GroupId = GroupId, AggregateId = e.AggregateId };
            db.ConsumerPositions.Add(position);
        }

        position.LastSeq = e.Seq;
        position.UpdatedAt = e.At;
        await db.SaveChangesAsync(ct);
        return ProjectionOutcome.Applied;
    }
}
