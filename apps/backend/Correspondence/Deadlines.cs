using System.Text.Json;
using Akka.Actor;
using Akka.Event;
using Chess.Backend.Akka;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Outbox;
using Chess.Backend.Events;
using Chess.Backend.Extensions;
using Chess.Backend.Games;
using Chess.Backend.Projections;

namespace Chess.Backend.Correspondence;

/// <summary>Section <c>Correspondence</c> (correspondence-games D1, D3).</summary>
internal sealed class CorrespondenceOptions : ISettings
{
    public const string SectionName = "Correspondence";

    /// <summary>How long the player to move has, from the previous move; reset after every move.</summary>
    public TimeSpan MoveDeadline { get; set; } = TimeSpan.FromDays(7);

    /// <summary>How often the deadline sweeper looks for games past their deadline.</summary>
    public int SweepSeconds { get; set; } = 60;

    public void Validate()
    {
        if (MoveDeadline <= TimeSpan.Zero)
        {
            throw new InvalidOperationException("Correspondence:MoveDeadline must be positive.");
        }

        if (SweepSeconds <= 0)
        {
            throw new InvalidOperationException("Correspondence:SweepSeconds must be positive.");
        }
    }
}

/// <summary>
/// Keeps <c>game_deadlines</c> for correspondence games from <c>game.events</c> (correspondence-games D3): the start and
/// every move set the player to move's deadline, the end clears it. The row holds this projection's watermark for the
/// game and stays after the end, so a replay changes nothing.
/// </summary>
internal sealed class DeadlineProjection(ProjectDbContext db, IOptions<CorrespondenceOptions> options, ILogger<DeadlineProjection> logger) : IProjection
{
    public string Topic => GameTopics.Kafka;

    public string GroupId => ConsumerGroups.Deadlines;

    public async Task<ProjectionOutcome> ApplyAsync(string key, string json, CancellationToken ct)
    {
        if (!EventJson.TryDeserialize(json, out EventEnvelope<JsonElement>? e)
            || !e.Type.StartsWith(GameEventTypes.Prefix, StringComparison.Ordinal)
            || !Guid.TryParseExact(e.AggregateId, "N", out Guid gameId))
        {
            return ProjectionOutcome.Ignored;
        }

        GameDeadline? row = await db.GameDeadlines.SingleOrDefaultAsync(d => d.GameId == gameId, ct);
        if (row is null)
        {
            if (e.Type == GameEventTypes.Created && e.Payload.Deserialize<GameCreated>() is { } created
                && created.TimeControl == TimeControl.Correspondence7.ToString())
            {
                db.GameDeadlines.Add(new GameDeadline { GameId = gameId, DueAt = e.At + options.Value.MoveDeadline, LastSeq = e.Seq });
                await db.SaveChangesAsync(ct);
                return ProjectionOutcome.Applied;
            }

            return ProjectionOutcome.Ignored; // a live game, or a later event of one
        }

        switch (IdempotencyGuard.Decide(row.LastSeq, e.Seq))
        {
            case SeqDecision.Skip:
                return ProjectionOutcome.Skipped;
            case SeqDecision.Gap:
                Utils.Log.ProjectionGap(logger, GroupId, e.AggregateId, row.LastSeq, e.Seq);
                throw new ProjectionGapException(GroupId, e.AggregateId, row.LastSeq, e.Seq);
        }

        if (e.Type == GameEventTypes.MoveMade && row.DueAt is not null)
        {
            row.DueAt = e.At + options.Value.MoveDeadline;
        }
        else if (e.Type == GameEventTypes.Ended)
        {
            row.DueAt = null;
        }

        row.LastSeq = e.Seq;
        await db.SaveChangesAsync(ct);
        return ProjectionOutcome.Applied;
    }
}

/// <summary>The games whose deadline has passed, earliest first, from the primary (the replica may lag).</summary>
internal interface IDueDeadlines
{
    Task<IReadOnlyList<Guid>> DueAsync(DateTimeOffset now, int max, CancellationToken ct);
}

internal sealed class DueDeadlines(IServiceScopeFactory scopes) : IDueDeadlines
{
    public async Task<IReadOnlyList<Guid>> DueAsync(DateTimeOffset now, int max, CancellationToken ct)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
        return await db.GameDeadlines.AsNoTracking()
            .Where(d => d.DueAt != null && d.DueAt <= now)
            .OrderBy(d => d.DueAt)
            .Take(max)
            .Select(d => d.GameId)
            .ToListAsync(ct);
    }
}

/// <summary>
/// A cluster singleton (correspondence-games D3): every <see cref="CorrespondenceOptions.SweepSeconds"/> it asks each game
/// past its deadline to check it. The game is the judge, so a row that is stale or seen twice costs one harmless check;
/// a game keeps being asked each sweep until its end reaches the projection.
/// </summary>
internal sealed class DeadlineSweeper : ReceiveActor, IWithTimers
{
    /// <summary>Each sweep is a trace of its own: the games it asks to check themselves continue it.</summary>
    protected override bool AroundReceive(Receive receive, object message) =>
        ActorTracing.Receive(ActorNames.DeadlineSweeper, message, m => base.AroundReceive(receive, m), m => m is Sweep);

    public const string SingletonName = ActorNames.DeadlineSweeper;

    /// <summary>At most this many checks per sweep; the rest wait for the next one.</summary>
    public const int MaxPerSweep = 100;

    private readonly IActorRef _games;
    private readonly IDueDeadlines _due;
    private readonly TimeProvider _clock;
    private readonly TimeSpan _every;
    private readonly ILoggingAdapter _log = Context.GetLogger();

    public DeadlineSweeper(IActorRef games, IDueDeadlines due, TimeProvider clock, TimeSpan every)
    {
        _games = games;
        _due = due;
        _clock = clock;
        _every = every;
        Receive<Sweep>(_ => _due.DueAsync(_clock.GetUtcNow(), MaxPerSweep, CancellationToken.None).PipeTo(Self, success: ids => ActorTracing.Wrap(ids)));
        Receive<IReadOnlyList<Guid>>(ids =>
        {
            foreach (Guid id in ids)
            {
                _games.Tell(ActorTracing.Wrap(new CheckDeadline(id)));
            }
        });
        Receive<Status.Failure>(f => _log.Warning(f.Cause, "deadline sweep failed; trying again next time"));
    }

    public ITimerScheduler Timers { get; set; } = null!;

    protected override void PreStart() => Timers.StartPeriodicTimer(nameof(Sweep), Sweep.Instance, _every);

    internal sealed class Sweep
    {
        public static readonly Sweep Instance = new();
    }
}

