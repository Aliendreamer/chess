using Akka.Cluster.Tools.PublishSubscribe;
using Akka.Event;
using Akka.Persistence;
using Chess.Backend.Engine;
using Chess.Backend.Events;
using Chess.Backend.Games;
using Chess.Backend.Messaging;

namespace Chess.Backend.Akka.Games;

/// <summary>
/// One live game (ROADMAP D13): the only writer of its board and clocks. Commands are validated here (who may act,
/// whose turn, the rules via <see cref="ChessRules"/>), then persisted as events; the reply and a
/// <see cref="LiveFrame"/> both come from the post-persist state, so a player reads their own write and watchers see
/// the same seq. Kafka is fed from the journal by the outbox, never from here. Sharded, one incarnation per id.
/// </summary>
internal sealed class GameActor : ReceivePersistentActor, IWithTimers
{
    /// <summary>Every message in a span of its sender's trace; the game's own timers start traces of their own.</summary>
    protected override bool AroundReceive(Receive receive, object message) => ActorTracing.Receive(
        "game",
        message,
        m => base.AroundReceive(receive, m),
        m => m is FlagCheck or AbortCheck or EngineStall or PresenceCheck,
        new("game.id", _gameId.ToString("N")));

    public const string PersistenceIdPrefix = "game-";
    public const int SnapshotEvery = 20;

    /// <summary>Each side's first move must come within this, or the game is aborted (D15).</summary>
    public static readonly TimeSpan FirstMoveWindow = TimeSpan.FromMinutes(1);

    private const string FlagTimer = "flag";
    private const string AbortTimer = "abort";
    private const string PassivateTimer = "passivate";
    private const string PresenceTimer = "presence";
    private const string EngineStallTimer = "engine-stall";

    private readonly Guid _gameId;

    /// <summary>When this incarnation started, for its recovery time.</summary>
    private readonly long _startedAt = System.Diagnostics.Stopwatch.GetTimestamp();
    private readonly IActorRef? _mediator;
    private readonly TimeProvider _clock;
    private readonly GameTimings _timings;
    private readonly ILoggingAdapter _log = Context.GetLogger();

    // Presence (presence-and-abandonment D2): who reported each player present, per BFF instance, and when last.
    // In memory only; after a recovery it refills from the BFF's next refresh.
    private readonly Dictionary<long, Dictionary<string, DateTimeOffset>> _presence = [];
    private readonly HashSet<long> _reported = [];
    private DateTimeOffset _incarnatedAt;

    // Persisted through PlayerLeft / PlayerReturned: who is away, and since when (restarted on recovery, D4).
    private readonly Dictionary<long, DateTimeOffset> _absentSince = [];
    private bool _tracking;
    private long? _offeredTo;

    private bool _created;
    private long _white;
    private long _black;
    private TimeControl _timeControl;
    private ChessRules _rules = ChessRules.NewGame();
    private string? _lastSan;
    private long _whiteMs;
    private long _blackMs;
    private GameStatus _status;
    private long? _drawOfferedBy;
    private long? _drawBlocked;
    private string? _result;
    private string? _reason;
    private int _eventsSinceSnapshot;
    private DateTimeOffset _createdAt;
    private DateTimeOffset _lastMoveAt;

    /// <summary>The engine's side and level in a game against it; null between people (engine-play D3, D5).</summary>
    private EnginePlayer? _engine;

    /// <summary>Asks the engine again when it has not moved within <see cref="GameTimings.EngineStall"/> (engine-play D6).</summary>
    private readonly IEngineRequests _engineRequests;

    /// <summary>When the side to move's clock started running; null while no clock runs (before both first moves).</summary>
    private DateTimeOffset? _turnStartedAt;

    public GameActor(Guid gameId, IActorRef? mediator, TimeProvider clock)
        : this(gameId, mediator, clock, GameTimings.Default)
    {
    }

    public GameActor(Guid gameId, IActorRef? mediator, TimeProvider clock, GameTimings timings)
        : this(gameId, mediator, clock, timings, NoEngineRequests.Instance)
    {
    }

    public GameActor(Guid gameId, IActorRef? mediator, TimeProvider clock, GameTimings timings, IEngineRequests engineRequests)
    {
        ArgumentNullException.ThrowIfNull(engineRequests);
        _engineRequests = engineRequests;
        ArgumentNullException.ThrowIfNull(clock);
        ArgumentNullException.ThrowIfNull(timings);
        _gameId = gameId;
        _mediator = mediator;
        _clock = clock;
        _timings = timings;
        _incarnatedAt = clock.GetUtcNow();

        Recover<GameCreated>(Apply);
        Recover<MoveMade>(e => Apply(e, replay: true));
        Recover<DrawOffered>(Apply);
        Recover<DrawDeclined>(Apply);
        Recover<GameEnded>(Apply);
        Recover<PlayerLeft>(Apply);
        Recover<PlayerReturned>(Apply);
        Recover<AbandonmentOffered>(Apply);
        Recover<SnapshotOffer>(offer =>
        {
            if (offer.Snapshot is GameSnapshot s)
            {
                Restore(s);
            }
        });

        Command<CreateGame>(HandleCreate);
        Command<GetGameView>(_ => Reply(_created ? View() : NotFound()));
        Command<MakeMove>(HandleMove);
        Command<Resign>(HandleResign);
        Command<OfferDraw>(HandleOfferDraw);
        Command<AcceptDraw>(HandleAcceptDraw);
        Command<DeclineDraw>(HandleDeclineDraw);
        Command<AbortGame>(HandleAbort);
        Command<ReportPresence>(HandlePresence);
        Command<ClaimAbandonment>(HandleClaim);
        Command<PresenceCheck>(_ => EvaluatePresence());
        Command<FlagCheck>(_ => HandleFlagCheck());
        Command<AbortCheck>(_ => HandleAbortCheck());
        Command<EngineStall>(_ => HandleEngineStall());
        Command<CheckDeadline>(_ => HandleCheckDeadline());
        Command<PassivateNow>(_ =>
        {
            ActorMetrics.Passivated("game");
            Context.Parent.Tell(new global::Akka.Cluster.Sharding.Passivate(PoisonPill.Instance));
        });
        Command<SaveSnapshotSuccess>(_ => { });
        Command<SaveSnapshotFailure>(f => _log.Warning(f.Cause, "snapshot failed for game {0}", _gameId));
    }

    public ITimerScheduler Timers { get; set; } = null!;

    public override string PersistenceId => PersistenceIdPrefix + _gameId.ToString("N");

    /// <summary>
    /// D18 flag fall: the flagged side loses, unless the opponent has no mating material — then it is a draw.
    /// Static and pure so the material cases are testable from a FEN.
    /// </summary>
    public static GameOutcome TimeoutOutcome(ChessRules rules, Side flagged)
    {
        ArgumentNullException.ThrowIfNull(rules);
        Side opponent = flagged.Opponent();
        return rules.CanMate(opponent)
            ? new GameOutcome(opponent.WinFor(), EndReason.Timeout)
            : new GameOutcome(GameResult.Draw, EndReason.TimeoutVsInsufficientMaterial);
    }

    /// <summary>
    /// Recovery (D14): the side to move gets its clock back as of the last event, and the turn restarts now. Likewise an
    /// absence restarts now (presence-and-abandonment D4), so an outage never brings a claim closer.
    /// </summary>
    protected override void OnReplaySuccess()
    {
        ActorMetrics.Recovered("game", _startedAt);
        DateTimeOffset now = _clock.GetUtcNow();
        if (ClocksRunning)
        {
            _turnStartedAt = now;
        }

        _incarnatedAt = now;
        foreach (long away in _absentSince.Keys.ToList())
        {
            _absentSince[away] = now;
        }

        _offeredTo = null;

        Rearm();
    }

    private string Topic => LiveTopics.Format("game", _gameId.ToString("N"));

    private int Ply => _rules.Moves.Count;

    // ---- commands ----------------------------------------------------------------------------------------------

    private void HandleCreate(CreateGame cmd)
    {
        if (_created)
        {
            bool same = cmd.WhiteId == _white && cmd.BlackId == _black && cmd.TimeControl == _timeControl && cmd.Engine == _engine;
            Reply(same ? View() : Rejected(RejectionCode.Conflict, "A different game already exists with this id."));
            return;
        }

        if (cmd.WhiteId == cmd.BlackId)
        {
            Reply(Rejected(RejectionCode.Conflict, "A game needs two different players."));
            return;
        }

        if (cmd.Engine is { } engine && !IsEngineSeat(engine, cmd.WhiteId, cmd.BlackId))
        {
            Reply(Rejected(RejectionCode.Conflict, "The engine must sit on its side as the player of its level."));
            return;
        }

        TimeControl tc = cmd.TimeControl;
        PersistAndReply([new GameCreated(cmd.WhiteId, cmd.BlackId, tc.ToString(), tc.InitialMs, tc.IncrementMs, _clock.GetUtcNow(), cmd.Engine)]);
    }

    private void HandleMove(MakeMove cmd)
    {
        if (Refuse(cmd.UserId) is { } refused)
        {
            Reply(refused);
            return;
        }

        if (cmd.UserId != PlayerToMove)
        {
            Reply(Rejected(RejectionCode.Conflict, "It is not your turn."));
            return;
        }

        if (cmd.AtPly is { } atPly && atPly != Ply)
        {
            Reply(Rejected(RejectionCode.Conflict, "That move was for an earlier position."));
            return;
        }

        DateTimeOffset now = _clock.GetUtcNow();
        if (ClocksRunning && RemainingMs(now) <= 0)
        {
            // The flag fell before this move arrived; the timer just hadn't fired yet.
            PersistAndReply([TimedOut(now)]);
            return;
        }

        if (DeadlineAt is { } deadline && now >= deadline)
        {
            // Past the correspondence deadline, before the sweeper got to it: the move comes too late.
            PersistAndReply([MissedDeadline(now)]);
            return;
        }

        // TryApply mutates the board on success, so the persist callback must not apply the move again (replay: false).
        MoveOutcome outcome = _rules.TryApply(cmd.Uci);
        if (outcome is MoveRejected rejected)
        {
            Reply(Rejected(RejectionCode.Illegal, rejected.Reason));
            return;
        }

        MoveApplied applied = (MoveApplied)outcome;

        // Before both first moves no clock runs (D15); after them the mover pays the elapsed time and earns the increment.
        long whiteMs = _whiteMs;
        long blackMs = _blackMs;
        if (_turnStartedAt is { } started)
        {
            long spent = (long)(now - started).TotalMilliseconds;
            if (cmd.UserId == _white)
            {
                whiteMs = whiteMs - spent + _timeControl.IncrementMs;
            }
            else
            {
                blackMs = blackMs - spent + _timeControl.IncrementMs;
            }
        }

        MoveMade moved = new(Ply, applied.Uci, applied.San, applied.FenAfter, whiteMs, blackMs, now);
        List<object> events = [moved];
        if (applied.End is { } end)
        {
            events.Add(Ended(end.Result, end.Reason, now));
        }

        PersistAndReply(events);
    }

    private void HandleResign(Resign cmd)
    {
        if (Refuse(cmd.UserId) is { } refused)
        {
            Reply(refused);
            return;
        }

        if (Ply == 0)
        {
            Reply(Rejected(RejectionCode.Conflict, "Nothing has been played yet: abort instead of resigning."));
            return;
        }

        PersistAndReply([Ended(SideOf(cmd.UserId).Opponent().WinFor(), EndReason.Resignation, _clock.GetUtcNow())]);
    }

    private void HandleOfferDraw(OfferDraw cmd)
    {
        if (Refuse(cmd.UserId) is { } refused)
        {
            Reply(refused);
            return;
        }

        if (_engine is not null)
        {
            Reply(Rejected(RejectionCode.Conflict, "The computer does not take draw offers."));
            return;
        }

        if (_drawOfferedBy == Opponent(cmd.UserId))
        {
            // Both want a draw: offering against a pending offer accepts it.
            PersistAndReply([Ended(GameResult.Draw, EndReason.Agreement, _clock.GetUtcNow())]);
            return;
        }

        if (_drawOfferedBy == cmd.UserId)
        {
            Reply(Rejected(RejectionCode.Conflict, "Your draw offer is already pending."));
            return;
        }

        if (_drawBlocked == cmd.UserId)
        {
            Reply(Rejected(RejectionCode.Conflict, "Make a move before offering a draw again."));
            return;
        }

        PersistAndReply([new DrawOffered(cmd.UserId, _clock.GetUtcNow())]);
    }

    private void HandleAcceptDraw(AcceptDraw cmd)
    {
        if (Refuse(cmd.UserId) is { } refused)
        {
            Reply(refused);
            return;
        }

        if (_drawOfferedBy != Opponent(cmd.UserId))
        {
            Reply(Rejected(RejectionCode.Conflict, "There is no draw offer from your opponent."));
            return;
        }

        PersistAndReply([Ended(GameResult.Draw, EndReason.Agreement, _clock.GetUtcNow())]);
    }

    private void HandleDeclineDraw(DeclineDraw cmd)
    {
        if (Refuse(cmd.UserId) is { } refused)
        {
            Reply(refused);
            return;
        }

        if (_drawOfferedBy != Opponent(cmd.UserId))
        {
            Reply(Rejected(RejectionCode.Conflict, "There is no draw offer from your opponent."));
            return;
        }

        PersistAndReply([new DrawDeclined(cmd.UserId, _clock.GetUtcNow())]);
    }

    private void HandleAbort(AbortGame cmd)
    {
        if (Refuse(cmd.UserId) is { } refused)
        {
            Reply(refused);
            return;
        }

        bool movedAlready = Ply >= 2 || (Ply == 1 && cmd.UserId == _white);
        if (movedAlready)
        {
            Reply(Rejected(RejectionCode.Conflict, "You have already moved: resign instead of aborting."));
            return;
        }

        PersistAndReply([Ended(GameResult.None, EndReason.Aborted, _clock.GetUtcNow())]);
    }

    private void HandlePresence(ReportPresence report)
    {
        // Fire-and-forget from the hub: spectators and finished games are simply ignored, and so is every report in a
        // game against the engine, which never connects (engine-play D5), or in a correspondence game, where the missed
        // deadline is the only abandonment (correspondence-games D2).
        if (!_created || _engine is not null || _timeControl.IsCorrespondence || _status == GameStatus.Ended
            || (report.UserId != _white && report.UserId != _black))
        {
            return;
        }

        _tracking = true;
        if (!_presence.TryGetValue(report.UserId, out Dictionary<string, DateTimeOffset>? byInstance))
        {
            _presence[report.UserId] = byInstance = [];
        }

        if (report.Present)
        {
            byInstance[report.Instance] = _clock.GetUtcNow();
        }
        else
        {
            byInstance.Remove(report.Instance);
        }

        _reported.Add(report.UserId);
        EvaluatePresence();
    }

    private void HandleClaim(ClaimAbandonment cmd)
    {
        if (Refuse(cmd.UserId) is { } refused)
        {
            Reply(refused);
            return;
        }

        DateTimeOffset now = _clock.GetUtcNow();
        if (ClaimableBy(now) != cmd.UserId)
        {
            Reply(Rejected(RejectionCode.Conflict, _absentSince.ContainsKey(Opponent(cmd.UserId))
                ? "Your opponent has not been away for a minute yet."
                : "Your opponent is here."));
            return;
        }

        GameResult result = cmd.Win ? SideOf(cmd.UserId).WinFor() : GameResult.Draw;
        PersistAndReply([Ended(result, EndReason.Abandonment, now)]);
    }

    /// <summary>
    /// Persists what changed about presence: a player gone or back (D3), or the claim opening (a marker, so its frame
    /// has a newer seq). Runs on every report and on the presence timer.
    /// </summary>
    private void EvaluatePresence()
    {
        if (!PresenceActive)
        {
            return;
        }

        DateTimeOffset now = _clock.GetUtcNow();
        List<object> events = [];
        foreach (long player in (long[])[_white, _black])
        {
            bool present = IsPresent(player, now);
            bool away = _absentSince.ContainsKey(player);
            if (!present && !away)
            {
                events.Add(new PlayerLeft(player, now));
            }
            else if (present && away)
            {
                events.Add(new PlayerReturned(player, now));
            }
        }

        if (events.Count == 0 && ClaimableBy(now) is { } claimant && _offeredTo != claimant)
        {
            events.Add(new AbandonmentOffered(claimant, now));
        }

        if (events.Count == 0)
        {
            Rearm();
            return;
        }

        PersistAll(ActorTracing.StampAll(events), ActorTracing.Persisting<object>("game", events.Count, e =>
        {
            ApplyLive(e);
            Publish(e);
            MaybeSnapshot();
            Rearm();
        }));
    }

    private void HandleFlagCheck()
    {
        if (_status == GameStatus.Ended || !ClocksRunning)
        {
            return;
        }

        DateTimeOffset now = _clock.GetUtcNow();
        if (RemainingMs(now) > 0)
        {
            Rearm(); // a stale timer: the turn changed or time was given back since it was armed
            return;
        }

        PersistAll(ActorTracing.StampAll<object>([TimedOut(now)]), ActorTracing.Persisting<object>("game", 1, e =>
        {
            ApplyLive(e);
            Publish(e);
            MaybeSnapshot();
            Rearm();
        }));
    }

    private void HandleAbortCheck()
    {
        if (_status == GameStatus.Ended || Ply >= 2 || EngineToMove)
        {
            return;
        }

        DateTimeOffset now = _clock.GetUtcNow();
        if (now < FirstMoveDeadline)
        {
            Rearm();
            return;
        }

        PersistAll(ActorTracing.StampAll<object>([Ended(GameResult.None, EndReason.Aborted, now)]), ActorTracing.Persisting<object>("game", 1, e =>
        {
            ApplyLive(e);
            Publish(e);
            MaybeSnapshot();
            Rearm();
        }));
    }

    /// <summary>A correspondence game past its deadline ends: aborted before both first moves, else lost on time.</summary>
    private void HandleCheckDeadline()
    {
        DateTimeOffset now = _clock.GetUtcNow();
        if (_status == GameStatus.Ended || DeadlineAt is not { } deadline || now < deadline)
        {
            return;
        }

        PersistAll(ActorTracing.StampAll<object>([MissedDeadline(now)]), ActorTracing.Persisting<object>("game", 1, e =>
        {
            ApplyLive(e);
            Publish(e);
            MaybeSnapshot();
            Rearm();
        }));
    }

    /// <summary>The engine has not moved in time: a request was lost, or the game moved node mid-think. Ask again.</summary>
    private void HandleEngineStall()
    {
        if (EngineToMove && _engine is { } engine)
        {
            _engineRequests.Nudge(_gameId, Ply, _rules.Fen, engine.Level);
        }

        Rearm();
    }

    /// <summary>Common gate: the game must exist, the sender must be a player (D10), and it must not be over.</summary>
    private GameRejected? Refuse(long userId) =>
        !_created ? NotFound()
        : userId != _white && userId != _black ? Rejected(RejectionCode.Forbidden, "Only the two players can act in this game.")
        : _status == GameStatus.Ended ? Rejected(RejectionCode.Conflict, "The game is over.")
        : null;

    // ---- persistence -------------------------------------------------------------------------------------------

    private void PersistAndReply(List<object> events)
    {
        IActorRef replyTo = Sender;
        PersistAll(ActorTracing.StampAll(events), ActorTracing.Persisting<object>("game", events.Count, e =>
        {
            ApplyLive(e);
            Publish(e);
            MaybeSnapshot();
            Rearm();
        }));
        DeferAsync(events[^1], _ => replyTo.Tell(View()));
    }

    /// <summary>Applies a just-persisted event; a move is already on the board, so it is not replayed.</summary>
    private void ApplyLive(object e)
    {
        switch (e)
        {
            case GameCreated c:
                Apply(c);
                break;
            case MoveMade m:
                Apply(m, replay: false);
                break;
            case DrawOffered o:
                Apply(o);
                break;
            case DrawDeclined d:
                Apply(d);
                break;
            case GameEnded g:
                Apply(g);
                break;
            case PlayerLeft l:
                Apply(l);
                break;
            case PlayerReturned r:
                Apply(r);
                break;
            case AbandonmentOffered o:
                Apply(o);
                break;
            default:
                throw new InvalidOperationException($"Unknown game event {e.GetType().Name}.");
        }
    }

    private void Apply(GameCreated e)
    {
        _created = true;
        _white = e.WhiteId;
        _black = e.BlackId;
        _timeControl = TimeControl.TryParseAny(e.TimeControl, out TimeControl tc)
            ? tc
            : throw new InvalidOperationException($"Unknown time control {e.TimeControl} in the journal.");
        _whiteMs = e.InitialMs;
        _blackMs = e.InitialMs;
        _engine = e.Engine;
        _status = GameStatus.Created;
        _rules = ChessRules.NewGame();
        _createdAt = e.At;
    }

    private void Apply(MoveMade e, bool replay)
    {
        if (replay && _rules.TryApply(e.Uci) is MoveRejected rejected)
        {
            throw new InvalidOperationException($"Journal move {e.Ply} ({e.Uci}) is illegal on replay: {rejected.Reason}");
        }

        long mover = e.Ply % 2 == 1 ? _white : _black;
        if (_drawBlocked == mover)
        {
            _drawBlocked = null; // the offerer has moved again
        }

        if (_drawOfferedBy is { } offerer && offerer != mover)
        {
            _drawBlocked = offerer; // the opponent moved instead of answering: the offer lapses
            _drawOfferedBy = null;
        }

        _lastSan = e.San;
        _whiteMs = e.WhiteMs;
        _blackMs = e.BlackMs;
        _status = GameStatus.Playing;
        _lastMoveAt = e.At;
        // From Black's first reply on, the side to move's clock runs from the moment of the last move (only with a clock).
        _turnStartedAt = Ply >= 2 && _timeControl.HasClock ? e.At : null;
    }

    private void Apply(DrawOffered e) => _drawOfferedBy = e.By;

    private void Apply(DrawDeclined e)
    {
        _drawBlocked = _drawOfferedBy;
        _drawOfferedBy = null;
    }

    private void Apply(GameEnded e)
    {
        _status = GameStatus.Ended;
        _result = e.Result;
        _reason = e.Reason;
        _whiteMs = e.WhiteMs;
        _blackMs = e.BlackMs;
        _drawOfferedBy = null;
        _turnStartedAt = null;
    }

    private void Apply(PlayerLeft e)
    {
        _tracking = true;
        _absentSince[e.UserId] = e.At;
    }

    private void Apply(PlayerReturned e)
    {
        _absentSince.Remove(e.UserId);
        _offeredTo = null;
    }

    private void Apply(AbandonmentOffered e) => _offeredTo = e.ClaimantId;

    private void Restore(GameSnapshot s)
    {
        _created = true;
        _white = s.WhiteId;
        _black = s.BlackId;
        _timeControl = TimeControl.TryParseAny(s.TimeControl, out TimeControl tc)
            ? tc
            : throw new InvalidOperationException($"Unknown time control {s.TimeControl} in a snapshot.");
        _rules = ChessRules.Replay(s.Moves);
        _lastSan = s.LastSan;
        _whiteMs = s.WhiteMs;
        _blackMs = s.BlackMs;
        _engine = s.Engine;
        _status = s.Status;
        _drawOfferedBy = s.DrawOfferedBy;
        _drawBlocked = s.DrawBlocked;
        _result = s.Result;
        _reason = s.Reason;
        _createdAt = s.CreatedAt;
        _lastMoveAt = s.LastMoveAt;
        _turnStartedAt = _status == GameStatus.Playing && Ply >= 2 && _timeControl.HasClock ? s.LastMoveAt : null;
        foreach (long away in s.Absent ?? [])
        {
            _tracking = true;
            _absentSince[away] = s.LastMoveAt; // restarted in OnReplaySuccess
        }
    }

    private void MaybeSnapshot()
    {
        if (++_eventsSinceSnapshot < SnapshotEvery)
        {
            return;
        }

        _eventsSinceSnapshot = 0;
        SaveSnapshot(new GameSnapshot(
            _white, _black, _timeControl.ToString(), [.. _rules.Moves], _lastSan, _whiteMs, _blackMs, _status,
            _drawOfferedBy, _drawBlocked, _result, _reason, _createdAt, _lastMoveAt, [.. _absentSince.Keys], _engine));
    }

    /// <summary>The game's new view on its live topic, carrying the trace of the event that changed it.</summary>
    private void Publish(object cause) =>
        _mediator?.Tell(new Publish(LiveTopics.PubSub, new LiveFrame(Topic, LastSequenceNr, View(), ActorTracing.TraceOf(cause))));

    // ---- helpers -----------------------------------------------------------------------------------------------

    private GameEnded Ended(GameResult result, EndReason reason, DateTimeOffset at) =>
        new(result.ToPgn(), reason.ToString(), CurrentMs(Side.White, at), CurrentMs(Side.Black, at), at);

    /// <summary>A missed correspondence deadline: an abort before both first moves (like D15), else a loss on time.</summary>
    private GameEnded MissedDeadline(DateTimeOffset at) =>
        Ply < 2 ? Ended(GameResult.None, EndReason.Aborted, at) : TimedOut(at);

    private GameEnded TimedOut(DateTimeOffset at)
    {
        GameOutcome outcome = TimeoutOutcome(_rules, _rules.SideToMove);
        return Ended(outcome.Result, outcome.Reason, at);
    }

    private bool ClocksRunning => _status == GameStatus.Playing && _turnStartedAt is not null;

    /// <summary>
    /// A correspondence game's deadline for the player to move (correspondence-games D1): a move-deadline after the
    /// previous move, or after the start for the first move. Derived, never stored; null when the game has none.
    /// </summary>
    private DateTimeOffset? DeadlineAt =>
        _created && _timeControl.IsCorrespondence && _status != GameStatus.Ended
            ? (Ply == 0 ? _createdAt : _lastMoveAt) + _timings.MoveDeadline
            : null;

    /// <summary>A game against the engine, not over, with the engine's side to move.</summary>
    private bool EngineToMove =>
        _engine is { } engine && _status != GameStatus.Ended
        && string.Equals(engine.Side, _rules.SideToMove.ToString(), StringComparison.OrdinalIgnoreCase);

    private DateTimeOffset FirstMoveDeadline => (Ply == 0 ? _createdAt : _lastMoveAt) + FirstMoveWindow;

    /// <summary>The side to move's remaining time at <paramref name="at"/>.</summary>
    private long RemainingMs(DateTimeOffset at) => CurrentMs(_rules.SideToMove, at);

    /// <summary>A side's clock at <paramref name="at"/>: stored value, minus the running turn if it is that side's, never below 0.</summary>
    private long CurrentMs(Side side, DateTimeOffset at)
    {
        long stored = side == Side.White ? _whiteMs : _blackMs;
        if (_turnStartedAt is not { } started || side != _rules.SideToMove)
        {
            return stored;
        }

        return Math.Max(0, stored - (long)(at - started).TotalMilliseconds);
    }

    /// <summary>
    /// One place decides which timer runs: the flag while clocks run, the first-move abort before that, and after the
    /// end only the passivation the game type allows (design D8).
    /// </summary>
    private void Rearm()
    {
        Timers.CancelAll();
        if (!_created)
        {
            return; // nothing to time: an uncreated game has no deadline, and aborting it would journal a ghost game
        }

        DateTimeOffset now = _clock.GetUtcNow();
        if (_status == GameStatus.Ended)
        {
            if (PassivationPolicy.For(_timeControl, _timings.UntimedIdle).AfterEnd is { } after)
            {
                Timers.StartSingleTimer(PassivateTimer, PassivateNow.Instance, after);
            }

            return;
        }

        if (ClocksRunning)
        {
            Timers.StartSingleTimer(FlagTimer, FlagCheck.Instance, TimeSpan.FromMilliseconds(RemainingMs(now)));
        }
        else if (Ply < 2 && !EngineToMove && !_timeControl.IsCorrespondence)
        {
            // The first-move abort is for people; the engine's first move is covered by its stall timer (engine-play D4).
            TimeSpan untilAbort = FirstMoveDeadline - now;
            Timers.StartSingleTimer(AbortTimer, AbortCheck.Instance, untilAbort > TimeSpan.Zero ? untilAbort : TimeSpan.Zero);
        }
        else if (PassivationPolicy.For(_timeControl, _timings.UntimedIdle).WhilePlaying is { } idle)
        {
            // Untimed and under way: nothing to time, so the game may leave memory once nobody has acted for a while.
            Timers.StartSingleTimer(PassivateTimer, PassivateNow.Instance, idle);
        }

        if (EngineToMove)
        {
            Timers.StartSingleTimer(EngineStallTimer, EngineStall.Instance, _timings.EngineStall);
        }

        if (NextPresenceCheck(now) is { } at)
        {
            Timers.StartSingleTimer(PresenceTimer, PresenceCheck.Instance, at > now ? at - now : TimeSpan.Zero);
        }
    }

    // ---- presence (presence-and-abandonment) -------------------------------------------------------------------

    /// <summary>Absence counts only while playing after both first moves, and only once the BFF reports on this game.</summary>
    private bool PresenceActive => _tracking && _status == GameStatus.Playing && Ply >= 2;

    /// <summary>
    /// Present while any BFF instance reported the player within the lease. A player not reported since this
    /// incarnation began keeps their persisted state for one lease: absent stays absent, present is presumed (D4).
    /// </summary>
    private bool IsPresent(long player, DateTimeOffset now)
    {
        if (_presence.TryGetValue(player, out Dictionary<string, DateTimeOffset>? byInstance)
            && byInstance.Values.Any(seen => now - seen < _timings.Lease))
        {
            return true;
        }

        return !_reported.Contains(player) && !_absentSince.ContainsKey(player) && now - _incarnatedAt < _timings.Lease;
    }

    /// <summary>The present player may claim once the other has been away for <see cref="GameTimings.AbandonAfter"/>.</summary>
    private long? ClaimableBy(DateTimeOffset now)
    {
        if (!PresenceActive || _absentSince.Count != 1)
        {
            return null; // nobody away, or both away: nobody can claim
        }

        (long away, DateTimeOffset since) = _absentSince.Single();
        return now - since >= _timings.AbandonAfter ? Opponent(away) : null;
    }

    private long? AbsentId => _status == GameStatus.Ended || _absentSince.Count == 0
        ? null
        : _absentSince.ContainsKey(_white) ? _white : _black;

    /// <summary>When presence next needs a look: a lease running out, a presumption ending, a claim opening.</summary>
    private DateTimeOffset? NextPresenceCheck(DateTimeOffset now)
    {
        if (!PresenceActive)
        {
            return null;
        }

        DateTimeOffset? next = null;
        void Consider(DateTimeOffset at) => next = next is null || at < next ? at : next;

        foreach (long player in (long[])[_white, _black])
        {
            bool present = IsPresent(player, now);
            if (_absentSince.TryGetValue(player, out DateTimeOffset since))
            {
                if (present)
                {
                    Consider(now);
                }
                else if (since + _timings.AbandonAfter > now)
                {
                    Consider(since + _timings.AbandonAfter);
                }
                else if (ClaimableBy(now) is { } claimant && _offeredTo != claimant)
                {
                    Consider(now); // due and not yet offered (never when both are away: nobody can claim)
                }

                continue;
            }

            if (!present)
            {
                Consider(now);
                continue;
            }

            if (_presence.TryGetValue(player, out Dictionary<string, DateTimeOffset>? byInstance) && byInstance.Count > 0)
            {
                Consider(byInstance.Values.Max() + _timings.Lease);
            }

            if (!_reported.Contains(player))
            {
                Consider(_incarnatedAt + _timings.Lease);
            }
        }

        return next;
    }

    private long PlayerToMove => _rules.SideToMove == Side.White ? _white : _black;

    private Side SideOf(long userId) => userId == _white ? Side.White : Side.Black;

    private long Opponent(long userId) => userId == _white ? _black : _white;

    private GameView View() => new(
        _gameId, _white, _black, _timeControl.ToString(), _status, _rules.Fen, Ply, _rules.SideToMove.ToString(),
        _rules.Moves.Count > 0 ? _rules.Moves[^1] : null, _lastSan,
        CurrentMs(Side.White, _clock.GetUtcNow()), CurrentMs(Side.Black, _clock.GetUtcNow()), _clock.GetUtcNow(),
        _drawOfferedBy, _result, _reason, LastSequenceNr, AbsentId, ClaimableBy(_clock.GetUtcNow()), _engine?.Side, _engine?.Level, DeadlineAt);

    /// <summary>The engine's seat is valid when its side is white or black and that side's player is its level's user.</summary>
    private static bool IsEngineSeat(EnginePlayer engine, long whiteId, long blackId) =>
        EngineLevel.Find(engine.Level) is { } level && engine.Side switch
        {
            "white" => whiteId == level.UserId,
            "black" => blackId == level.UserId,
            _ => false,
        };

    private GameRejected NotFound() => Rejected(RejectionCode.NotFound, "No such game.");

    private GameRejected Rejected(RejectionCode code, string reason) => new(_gameId, code, reason);

    private void Reply(object message) => Sender.Tell(message);

    /// <summary>The flag timer fired; re-checked against the clock before ending anything.</summary>
    internal sealed class FlagCheck
    {
        public static readonly FlagCheck Instance = new();

        private FlagCheck()
        {
        }
    }

    private sealed class AbortCheck
    {
        public static readonly AbortCheck Instance = new();
    }

    private sealed class EngineStall
    {
        public static readonly EngineStall Instance = new();
    }

    private sealed class PassivateNow
    {
        public static readonly PassivateNow Instance = new();
    }

    private sealed class PresenceCheck
    {
        public static readonly PresenceCheck Instance = new();
    }
}

/// <summary>
/// The actor's configurable timings: presence (presence-and-abandonment D2–D3), how long an untimed game may sit idle
/// before it passivates (engine-play D4), how long the engine may stay silent before the game asks again (D6), and a
/// correspondence game's time per move (correspondence-games D1).
/// Configurable so integration tests need not wait minutes.
/// </summary>
internal sealed record GameTimings(TimeSpan AbandonAfter, TimeSpan Lease, TimeSpan UntimedIdle, TimeSpan EngineStall, TimeSpan MoveDeadline)
{
    public static readonly GameTimings Default =
        new(TimeSpan.FromMinutes(1), TimeSpan.FromSeconds(75), TimeSpan.FromMinutes(30), TimeSpan.FromSeconds(60), TimeSpan.FromDays(7));
}
