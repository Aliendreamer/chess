using Akka.Cluster.Tools.PublishSubscribe;
using Akka.Event;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;
using Chess.Backend.Live;

namespace Chess.Backend.Akka.Matchmaking;

/// <summary>
/// Join a queue. <paramref name="Heartbeat"/> marks a keep-alive from a client already waiting: only a heartbeat may
/// be answered with a pairing it raced. A fresh join always seeks a new game.
/// </summary>
internal sealed record JoinQueue(long UserId, string TimeControl, bool Heartbeat = false);

internal sealed record LeaveQueue(long UserId, string TimeControl);

internal sealed record GetQueue(string TimeControl);

/// <summary>Queued: your place (1 = next to be paired) and how many are waiting.</summary>
/// <summary>
/// Still waiting. <paramref name="Seq"/> is the queue's live seq as of this answer: a client ignores pairings in
/// frames up to it, which may still show an earlier game of theirs (the last pairing stays on the queue's view).
/// </summary>
internal sealed record Waiting(string TimeControl, int Position, int WaitingCount, long Seq);

internal sealed record Matched(string TimeControl, Guid GameId, long WhiteId, long BlackId);

internal sealed record Left(string TimeControl);

internal sealed record QueueRejected(string Reason);

internal sealed record Pairing(Guid GameId, long WhiteId, long BlackId);

/// <summary>The <c>queue:{tc}</c> live payload: a whole state (not a delta), so a reconnect just replaces it.</summary>
internal sealed record QueueView(string TimeControl, int WaitingCount, Pairing? LastPairing, long Seq);

/// <summary>
/// All matchmaking queues, one per D12 preset (game-matchmaking): a cluster singleton holding them in memory, not
/// persisted. First come, first served, random colours, one entry per user across queues. Seekers stay queued by
/// re-joining (a heartbeat); entries silent for <see cref="EntryTtl"/> are swept, so a closed tab drops out and a
/// failover is healed by the next heartbeat. A pairing is remembered for <see cref="EntryTtl"/> so a heartbeat that
/// raced it answers with the same game instead of queueing the player again.
/// </summary>
internal sealed class MatchmakingActor : ReceiveActor, IWithTimers
{
    public const string SingletonName = "matchmaking";

    public static readonly TimeSpan EntryTtl = TimeSpan.FromSeconds(60);

    private static readonly TimeSpan SweepEvery = TimeSpan.FromSeconds(5);

    private readonly IGameStarter _starter;
    private readonly IActorRef? _mediator;
    private readonly TimeProvider _clock;
    private readonly Random _random;
    private readonly ILoggingAdapter _log = Context.GetLogger();

    private readonly Dictionary<string, List<Entry>> _queues = new(StringComparer.Ordinal);
    private readonly Dictionary<long, Entry> _byUser = [];
    private readonly Dictionary<long, (Matched Match, DateTimeOffset At)> _recent = [];
    private readonly Dictionary<string, long> _seq = new(StringComparer.Ordinal);
    private readonly Dictionary<string, Pairing> _lastPairing = new(StringComparer.Ordinal);

    public MatchmakingActor(IGameStarter starter, IActorRef? mediator, TimeProvider clock, Random random)
    {
        ArgumentNullException.ThrowIfNull(starter);
        ArgumentNullException.ThrowIfNull(clock);
        ArgumentNullException.ThrowIfNull(random);
        _starter = starter;
        _mediator = mediator;
        _clock = clock;
        _random = random;

        Receive<JoinQueue>(HandleJoin);
        Receive<LeaveQueue>(HandleLeave);
        Receive<GetQueue>(q => Sender.Tell(TimeControl.TryParse(q.TimeControl, out _) ? View(q.TimeControl) : new QueueRejected(NotAPreset(q.TimeControl))));
        Receive<GameStarted>(HandleStarted);
        Receive<StartFailed>(HandleStartFailed);
        Receive<Sweep>(_ => SweepExpired());
    }

    public ITimerScheduler Timers { get; set; } = null!;

    protected override void PreStart() => Timers.StartPeriodicTimer("sweep", Sweep.Instance, SweepEvery);

    private void HandleJoin(JoinQueue join)
    {
        if (!TimeControl.TryParse(join.TimeControl, out TimeControl tc))
        {
            Sender.Tell(new QueueRejected(NotAPreset(join.TimeControl)));
            return;
        }

        DateTimeOffset now = _clock.GetUtcNow();
        SweepExpired();
        if (!join.Heartbeat)
        {
            _recent.Remove(join.UserId); // a fresh join after a quick game must not get that game back
        }
        else if (_recent.TryGetValue(join.UserId, out (Matched Match, DateTimeOffset At) recent) && recent.Match.TimeControl == join.TimeControl)
        {
            Sender.Tell(recent.Match); // a heartbeat that raced its own pairing
            return;
        }

        if (_byUser.TryGetValue(join.UserId, out Entry? existing))
        {
            if (existing.TimeControl == join.TimeControl)
            {
                existing.LastSeen = now;
                Sender.Tell(WaitingFor(existing));
                return;
            }

            Remove(existing); // joining another queue moves you
        }

        List<Entry> queue = Queue(join.TimeControl);
        if (queue.Count > 0)
        {
            Entry opponent = queue[0]; // oldest first; never yourself, since you were just removed from every queue
            Remove(opponent, publish: false);
            bool joinerIsWhite = _random.Next(2) == 0;
            long white = joinerIsWhite ? join.UserId : opponent.UserId;
            long black = joinerIsWhite ? opponent.UserId : join.UserId;
            IActorRef replyTo = Sender;
            _starter.StartAsync(white, black, tc, CancellationToken.None).PipeTo(
                Self,
                success: view => new GameStarted(join.TimeControl, view.GameId, white, black, replyTo),
                failure: ex => new StartFailed(opponent, replyTo, ex));
            return;
        }

        Entry entry = new(join.UserId, join.TimeControl, now) { LastSeen = now };
        queue.Add(entry);
        _byUser[join.UserId] = entry;
        Publish(join.TimeControl); // first, so the answer's seq covers this join's own frame
        Sender.Tell(WaitingFor(entry));
    }

    private void HandleLeave(LeaveQueue leave)
    {
        if (_byUser.TryGetValue(leave.UserId, out Entry? entry) && entry.TimeControl == leave.TimeControl)
        {
            Remove(entry);
        }

        Sender.Tell(new Left(leave.TimeControl));
    }

    private void HandleStarted(GameStarted s)
    {
        Matched matched = new(s.TimeControl, s.GameId, s.WhiteId, s.BlackId);
        DateTimeOffset now = _clock.GetUtcNow();
        _recent[s.WhiteId] = (matched, now);
        _recent[s.BlackId] = (matched, now);
        _lastPairing[s.TimeControl] = new Pairing(s.GameId, s.WhiteId, s.BlackId);
        s.ReplyTo.Tell(matched);
        Publish(s.TimeControl);
    }

    private void HandleStartFailed(StartFailed f)
    {
        // The game could not be started: the waiting opponent keeps their place at the head; the joiner may retry.
        _log.Warning(f.Cause, "matchmaking could not start a game in {0}", f.Opponent.TimeControl);
        Queue(f.Opponent.TimeControl).Insert(0, f.Opponent);
        _byUser[f.Opponent.UserId] = f.Opponent;
        f.ReplyTo.Tell(new QueueRejected("Could not start the game; try again."));
    }

    private void SweepExpired()
    {
        DateTimeOffset now = _clock.GetUtcNow();
        foreach (Entry stale in _byUser.Values.Where(e => now - e.LastSeen > EntryTtl).ToList())
        {
            Remove(stale);
        }

        foreach (long user in _recent.Where(r => now - r.Value.At > EntryTtl).Select(r => r.Key).ToList())
        {
            _recent.Remove(user);
        }
    }

    private void Remove(Entry entry, bool publish = true)
    {
        Queue(entry.TimeControl).Remove(entry);
        _byUser.Remove(entry.UserId);
        if (publish)
        {
            Publish(entry.TimeControl);
        }
    }

    private List<Entry> Queue(string tc)
    {
        if (!_queues.TryGetValue(tc, out List<Entry>? queue))
        {
            _queues[tc] = queue = [];
        }

        return queue;
    }

    private Waiting WaitingFor(Entry entry)
    {
        List<Entry> queue = Queue(entry.TimeControl);
        return new Waiting(entry.TimeControl, queue.IndexOf(entry) + 1, queue.Count, _seq.GetValueOrDefault(entry.TimeControl));
    }

    private QueueView View(string tc) =>
        new(tc, Queue(tc).Count, _lastPairing.GetValueOrDefault(tc), _seq.GetValueOrDefault(tc));

    private void Publish(string tc)
    {
        _seq[tc] = _seq.GetValueOrDefault(tc) + 1;
        _mediator?.Tell(new Publish(LiveTopics.PubSub, new LiveFrame(LiveTopics.Format(QueueLiveSource.KindName, tc), _seq[tc], View(tc))));
    }

    private static string NotAPreset(string tc) => $"'{tc}' is not one of the time controls on offer.";

    private sealed class Entry(long userId, string timeControl, DateTimeOffset joinedAt)
    {
        public long UserId { get; } = userId;

        public string TimeControl { get; } = timeControl;

        public DateTimeOffset JoinedAt { get; } = joinedAt;

        public DateTimeOffset LastSeen { get; set; }
    }

    private sealed record GameStarted(string TimeControl, Guid GameId, long WhiteId, long BlackId, IActorRef ReplyTo);

    private sealed record StartFailed(Entry Opponent, IActorRef ReplyTo, Exception Cause);

    private sealed class Sweep
    {
        public static readonly Sweep Instance = new();
    }
}

/// <summary>The <c>queue</c> live kind: the snapshot is the queue's current state, asked from the singleton.</summary>
internal sealed class QueueLiveSource(IRequiredActor<MatchmakingActor> matchmaker) : ILiveTopicSource
{
    public const string KindName = "queue";

    private static readonly TimeSpan AskTimeout = TimeSpan.FromSeconds(5);

    public string Kind => KindName;

    public bool IsValidId(string id) => TimeControl.TryParse(id, out _);

    public async Task<LiveFrame?> SnapshotAsync(string id, CancellationToken ct) =>
        await matchmaker.ActorRef.Ask(new GetQueue(id), AskTimeout, ct) is QueueView view
            ? new LiveFrame(LiveTopics.Format(KindName, id), view.Seq, view)
            : null;
}
