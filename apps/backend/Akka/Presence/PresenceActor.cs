using Akka.Cluster.Tools.PublishSubscribe;
using Akka.Event;
using Chess.Backend.Messaging;

namespace Chess.Backend.Akka.Presence;

/// <summary>
/// Who in the club is online, playing or offline, and the open challenges between members (club-members D1, D2): a
/// cluster singleton, in memory only. Online = at least one live lease from the BFF's reports on the member's own
/// <c>user:</c> topic, a lease lasting <c>Akka:PresenceLeaseSeconds</c> like a game's. Playing = in a game against a
/// person, learned from the games' <see cref="PresenceTopics.PubSub"/> announcements (and, after a failover, from
/// <c>rm_games</c>). A challenge is reserved here so its checks are atomic: one out per challenger, one in per opponent.
/// Every change publishes: the <c>members:all</c> frame when anyone's state changes, the <c>user:{id}</c> frame when
/// the challenges to that member change. Seqs start from the wall clock, so a new incarnation never goes backwards.
/// </summary>
internal sealed class PresenceActor : ReceiveActor, IWithTimers
{
    protected override bool AroundReceive(Receive receive, object message) =>
        ActorTracing.Receive(ActorNames.Presence, message, m => base.AroundReceive(receive, m));

    public const string SingletonName = ActorNames.Presence;

    /// <summary>An unopened reservation (the invite was never made) goes after this.</summary>
    public static readonly TimeSpan PendingGrace = TimeSpan.FromSeconds(30);

    /// <summary>An opened challenge whose invite never said it ended goes this long after it ran out.</summary>
    public static readonly TimeSpan ExpiredGrace = TimeSpan.FromSeconds(10);

    private const string SweepTimer = "sweep";

    private readonly IMemberDirectory _directory;
    private readonly IActorRef? _mediator;
    private readonly TimeProvider _clock;
    private readonly TimeSpan _lease;
    private readonly TimeSpan _sweepEvery;
    private readonly ILoggingAdapter _log = Context.GetLogger();

    /// <summary>Per member, per BFF instance: when it last reported the member present.</summary>
    private readonly Dictionary<long, Dictionary<string, DateTimeOffset>> _leases = [];

    /// <summary>Per member: their games against a person still being played.</summary>
    private readonly Dictionary<long, HashSet<Guid>> _games = [];

    /// <summary>When each member went offline, until the directory has it.</summary>
    private readonly Dictionary<long, DateTimeOffset> _lastSeen = [];

    /// <summary>The state last published for every member not offline: a change is judged against it.</summary>
    private readonly Dictionary<long, MemberState> _known = [];

    private readonly Dictionary<Guid, Reservation> _challenges = [];

    private long _seq;
    private bool _membersFetching;
    private bool _membersStale;

    public PresenceActor(IMemberDirectory directory, IActorRef? mediator, TimeProvider clock, TimeSpan lease, TimeSpan sweepEvery)
    {
        ArgumentNullException.ThrowIfNull(directory);
        ArgumentNullException.ThrowIfNull(clock);
        _directory = directory;
        _mediator = mediator;
        _clock = clock;
        _lease = lease;
        _sweepEvery = sweepEvery;
        _seq = clock.GetUtcNow().ToUnixTimeMilliseconds();

        Receive<ReportUserPresence>(HandleReport);
        Receive<PlayerGameStarted>(g => Track(g.GameId, [g.WhiteId, g.BlackId], playing: true));
        Receive<PlayerGameEnded>(g => Track(g.GameId, [g.WhiteId, g.BlackId], playing: false));
        Receive<GetPresence>(_ => Sender.Tell(Snapshot()));
        Receive<GetMembersView>(_ => FetchMembers(Sender));
        Receive<GetUserView>(q => Sender.Tell(UserViewOf(q.UserId, _seq)));
        Receive<TryReserveChallenge>(HandleReserve);
        Receive<ChallengeOpened>(HandleOpened);
        Receive<ReleaseChallenge>(r => Release(r.InviteId));
        Receive<DropMember>(HandleDrop);
        Receive<RefreshMembers>(_ => PublishMembers());
        Receive<MembersFetched>(HandleMembersFetched);
        Receive<GamesSeeded>(HandleSeeded);
        Receive<Sweep>(_ => HandleSweep());
        Receive<SubscribeAck>(_ => { });
        Receive<Status.Failure>(f => _log.Warning(f.Cause, "presence: a directory call failed"));
        Receive<MembersFetchFailed>(f =>
        {
            _log.Warning(f.Cause, "presence: could not read the members");
            _membersFetching = false;
            f.ReplyTo?.Tell(new Status.Failure(f.Cause));
        });
        Receive<global::Akka.Done>(_ => { });
    }

    public ITimerScheduler Timers { get; set; } = null!;

    protected override void PreStart()
    {
        _mediator?.Tell(new Subscribe(PresenceTopics.PubSub, Self));
        Timers.StartPeriodicTimer(SweepTimer, Sweep.Instance, _sweepEvery);
        _directory.LiveGamesAsync(CancellationToken.None).PipeTo(Self, success: games => new GamesSeeded(games));
    }

    // ---- presence ----------------------------------------------------------------------------------------------

    private void HandleReport(ReportUserPresence report)
    {
        DateTimeOffset now = _clock.GetUtcNow();
        if (report.Present)
        {
            if (!_leases.TryGetValue(report.UserId, out Dictionary<string, DateTimeOffset>? byInstance))
            {
                _leases[report.UserId] = byInstance = new(StringComparer.Ordinal);
            }

            byInstance[report.Instance] = now;
        }
        else if (_leases.TryGetValue(report.UserId, out Dictionary<string, DateTimeOffset>? byInstance))
        {
            byInstance.Remove(report.Instance);
            if (byInstance.Count == 0)
            {
                _leases.Remove(report.UserId);
            }
        }

        Changed([report.UserId], now);
    }

    private void Track(Guid gameId, long[] players, bool playing)
    {
        DateTimeOffset now = _clock.GetUtcNow();
        foreach (long player in players)
        {
            if (playing)
            {
                if (!_games.TryGetValue(player, out HashSet<Guid>? games))
                {
                    _games[player] = games = [];
                }

                games.Add(gameId);
            }
            else if (_games.TryGetValue(player, out HashSet<Guid>? games) && games.Remove(gameId) && games.Count == 0)
            {
                _games.Remove(player);
            }
        }

        Changed(players, now);
    }

    private void HandleSeeded(GamesSeeded seeded)
    {
        foreach (LiveGame game in seeded.Games)
        {
            Track(game.GameId, [game.WhiteId, game.BlackId], playing: true);
        }
    }

    private void HandleSweep()
    {
        DateTimeOffset now = _clock.GetUtcNow();
        Dictionary<long, DateTimeOffset> lastReport = [];
        foreach ((long user, Dictionary<string, DateTimeOffset> byInstance) in _leases.ToList())
        {
            List<string> stale = [.. byInstance.Where(l => now - l.Value >= _lease).Select(l => l.Key)];
            foreach (string instance in stale)
            {
                DateTimeOffset at = byInstance[instance];
                if (!lastReport.TryGetValue(user, out DateTimeOffset latest) || at > latest)
                {
                    lastReport[user] = at;
                }

                byInstance.Remove(instance);
            }

            if (byInstance.Count == 0)
            {
                _leases.Remove(user);
            }
        }

        // A member whose last lease ran out was last seen at their last report, not at this sweep.
        Changed([.. _known.Keys], now, lastReport);

        foreach ((Guid id, Reservation r) in _challenges.ToList())
        {
            bool gone = r.ExpiresAt is { } expires ? now >= expires + ExpiredGrace : now >= r.ReservedAt + Invite.Lifetime + PendingGrace;
            if (gone)
            {
                Release(id);
            }
        }
    }

    /// <summary>
    /// Publishes the members frame when any of <paramref name="users"/> changed state since the last one, and records
    /// who went offline (at <paramref name="seenAt"/>'s time for them, else now).
    /// </summary>
    private void Changed(IEnumerable<long> users, DateTimeOffset now, IReadOnlyDictionary<long, DateTimeOffset>? seenAt = null)
    {
        bool changed = false;
        foreach (long user in users.Distinct())
        {
            MemberState state = StateOf(user, now);
            if (state == _known.GetValueOrDefault(user, MemberState.Offline))
            {
                continue;
            }

            changed = true;
            if (state != MemberState.Offline)
            {
                _known[user] = state;
                continue;
            }

            _known.Remove(user);
            DateTimeOffset seen = seenAt?.GetValueOrDefault(user) is { } at && at != default ? at : now;
            _lastSeen[user] = seen;
            _directory.MarkLastSeenAsync(user, seen, CancellationToken.None).PipeTo(Self, success: () => global::Akka.Done.Instance);
        }

        if (changed)
        {
            PublishMembers();
        }
    }

    private MemberState StateOf(long user, DateTimeOffset now) =>
        _games.ContainsKey(user) ? MemberState.Playing
        : _leases.TryGetValue(user, out Dictionary<string, DateTimeOffset>? byInstance) && byInstance.Values.Any(at => now - at < _lease) ? MemberState.Online
        : MemberState.Offline;

    private PresenceSnapshot Snapshot()
    {
        DateTimeOffset now = _clock.GetUtcNow();
        Dictionary<long, MemberState> states = [];
        foreach (long user in _leases.Keys.Concat(_games.Keys).Distinct())
        {
            MemberState state = StateOf(user, now);
            if (state != MemberState.Offline)
            {
                states[user] = state;
            }
        }

        return new PresenceSnapshot(states, new Dictionary<long, DateTimeOffset>(_lastSeen), _seq);
    }

    // ---- the members frame -------------------------------------------------------------------------------------

    private void PublishMembers()
    {
        if (_membersFetching)
        {
            _membersStale = true; // one more read once this one is back
            return;
        }

        FetchMembers(null);
    }

    private void FetchMembers(IActorRef? replyTo)
    {
        if (replyTo is null)
        {
            _membersFetching = true;
        }

        _directory.ActiveMembersAsync(CancellationToken.None).PipeTo(
            Self,
            success: rows => new MembersFetched(rows, replyTo),
            failure: ex => new MembersFetchFailed(replyTo, ex));
    }

    private void HandleMembersFetched(MembersFetched fetched)
    {
        if (fetched.ReplyTo is { } replyTo)
        {
            replyTo.Tell(MembersList.Build(fetched.Rows, Snapshot()));
            return;
        }

        _membersFetching = false;
        long seq = NextSeq();
        MembersView view = MembersList.Build(fetched.Rows, Snapshot() with { Seq = seq });
        _mediator?.Tell(new Publish(LiveTopics.PubSub, new LiveFrame(MembersLiveSource.Topic, seq, view, ActorTracing.TraceOf(null))));
        if (_membersStale)
        {
            _membersStale = false;
            PublishMembers();
        }
    }

    // ---- challenges --------------------------------------------------------------------------------------------

    private void HandleReserve(TryReserveChallenge cmd)
    {
        DateTimeOffset now = _clock.GetUtcNow();
        ChallengeRefusal? refusal =
            cmd.FromId == cmd.ToId ? ChallengeRefusal.Self
            : StateOf(cmd.ToId, now) == MemberState.Playing ? ChallengeRefusal.Playing
            : StateOf(cmd.ToId, now) == MemberState.Offline ? ChallengeRefusal.Offline
            : _challenges.Values.Any(r => r.FromId == cmd.FromId) ? ChallengeRefusal.ChallengeOut
            : _challenges.Values.Any(r => r.ToId == cmd.ToId) ? ChallengeRefusal.AlreadyChallenged
            : null;
        if (refusal is { } reason)
        {
            Sender.Tell(new ChallengeRefused(reason));
            return;
        }

        _challenges[cmd.InviteId] = new Reservation(cmd.FromId, cmd.FromName, cmd.ToId, cmd.TimeControl, cmd.Color, now);
        Sender.Tell(new ChallengeReserved(cmd.InviteId));
    }

    private void HandleOpened(ChallengeOpened opened)
    {
        if (!_challenges.TryGetValue(opened.InviteId, out Reservation? r) || r.ExpiresAt is not null)
        {
            return; // released already (an end raced the opening), or a repeat
        }

        _challenges[opened.InviteId] = r with { ExpiresAt = opened.ExpiresAt };
        PublishUser(r.ToId);
    }

    private void Release(Guid inviteId)
    {
        if (_challenges.Remove(inviteId, out Reservation? r) && r.ExpiresAt is not null)
        {
            PublishUser(r.ToId);
        }
    }

    private void HandleDrop(DropMember drop)
    {
        DateTimeOffset now = _clock.GetUtcNow();
        _leases.Remove(drop.UserId);
        List<Guid> challenges = [.. _challenges.Where(c => c.Value.FromId == drop.UserId || c.Value.ToId == drop.UserId).Select(c => c.Key)];
        foreach (Guid id in challenges)
        {
            Release(id);
        }

        Sender.Tell(new MemberDropped(challenges));
        Changed([drop.UserId], now);
        PublishMembers(); // they leave the list even if they were offline already
    }

    private void PublishUser(long userId)
    {
        UserView view = UserViewOf(userId, NextSeq());
        _mediator?.Tell(new Publish(LiveTopics.PubSub, UserLiveSource.ToFrame(view, ActorTracing.TraceOf(null))));
    }

    private UserView UserViewOf(long userId, long seq) => new(
        userId,
        seq,
        [.. _challenges
            .Where(c => c.Value.ToId == userId && c.Value.ExpiresAt is not null)
            .OrderBy(c => c.Value.ExpiresAt)
            .Select(c => new ChallengeItem(c.Key, c.Value.FromId, c.Value.FromName, c.Value.TimeControl, c.Value.Color, c.Value.ExpiresAt!.Value))]);

    private long NextSeq()
    {
        _seq = Math.Max(_seq + 1, _clock.GetUtcNow().ToUnixTimeMilliseconds());
        return _seq;
    }

    private sealed record Reservation(long FromId, string FromName, long ToId, string TimeControl, string Color, DateTimeOffset ReservedAt)
    {
        /// <summary>Set once the invite exists: from then on it shows on the opponent's topic.</summary>
        public DateTimeOffset? ExpiresAt { get; init; }
    }

    private sealed record MembersFetched(IReadOnlyList<MemberRow> Rows, IActorRef? ReplyTo);

    private sealed record MembersFetchFailed(IActorRef? ReplyTo, Exception Cause);

    private sealed record GamesSeeded(IReadOnlyList<LiveGame> Games);

    private sealed class Sweep
    {
        public static readonly Sweep Instance = new();
    }

    /// <summary>The challenge lifetime, named here for the pending grace.</summary>
    private static class Invite
    {
        public static readonly TimeSpan Lifetime = Matchmaking.Challenge.Lifetime;
    }
}
