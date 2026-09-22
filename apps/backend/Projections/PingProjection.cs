using Chess.Backend.Akka.Ping;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Events;

namespace Chess.Backend.Projections;

internal sealed class PingProjection(ProjectDbContext db, ILogger<PingProjection> logger) : IProjection
{
    public string Topic => PingTopics.Kafka;

    public string GroupId => "chess.rm-pings";

    public async Task ApplyAsync(string key, string json, CancellationToken ct)
    {
        if (!EventJson.TryDeserialize(json, out EventEnvelope<Pinged>? e) || e.Type != EventTypes.Pinged)
        {
            return; // other aggregates share the topic; not ours
        }

        // Shape 1 of design D10: the read row carries its own high-water mark, saved with the update below.
        RmPing? row = await db.RmPings.SingleOrDefaultAsync(p => p.PingId == e.AggregateId, ct);
        long lastSeq = row?.LastSeq ?? 0;
        switch (IdempotencyGuard.Decide(lastSeq, e.Seq))
        {
            case SeqDecision.Skip:
                Log.ProjectionSkippedReplay(logger, e.AggregateId, e.Seq);
                return;
            case SeqDecision.Gap:
                Log.ProjectionGap(logger, GroupId, e.AggregateId, lastSeq, e.Seq);
                throw new ProjectionGapException(GroupId, e.AggregateId, lastSeq, e.Seq);
        }

        if (row is null)
        {
            row = new RmPing { PingId = e.AggregateId };
            db.RmPings.Add(row);
        }

        row.Count++;
        row.LastText = e.Payload.Text;
        row.LastAt = e.Payload.At;
        row.LastSeq = e.Seq;
        row.UpdatedAt = e.At;
        await db.SaveChangesAsync(ct);
    }
}
