using Akka.Cluster.Tools.PublishSubscribe;
using Akka.Event;
using Akka.Persistence;
using Chess.Backend.Events;
using Chess.Backend.Games;
using Chess.Backend.Live;

namespace Chess.Backend.Akka.Games;

/// <summary>
/// One live game (ROADMAP D13): the only writer of its board and clocks. Commands are validated here (who may act,
/// whose turn, the rules via <see cref="ChessRules"/>), then persisted as events; the reply and a
/// <see cref="LiveFrame"/> both come from the post-persist state, so a player reads their own write and watchers see
/// the same seq. Kafka is fed from the journal by the outbox, never from here. Sharded, one incarnation per id.
/// </summary>
internal sealed class GameActor : ReceivePersistentActor, IWithTimers
{
    public const string PersistenceIdPrefix = "game-";
    public const int SnapshotEvery = 20;

    /// <summary>Each side's first move must come within this, or the game is aborted (D15).</summary>
    public static readonly TimeSpan FirstMoveWindow = TimeSpan.FromMinutes(1);

    private const string FlagTimer = "flag";
    private const string AbortTimer = "abort";
    private const string PassivateTimer = "passivate";

    private readonly Guid _gameId;
    private readonly IActorRef? _mediator;
    private readonly TimeProvider _clock;
    private readonly ILoggingAdapter _log = Context.GetLogger();

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

    /// <summary>When the side to move's clock started running; null while no clock runs (before both first moves).</summary>
    private DateTimeOffset? _turnStartedAt;

    public GameActor(Guid gameId, IActorRef? mediator, TimeProvider clock)
    {
        ArgumentNullException.ThrowIfNull(clock);
        _gameId = gameId;
        _mediator = mediator;
        _clock = clock;

        Recover<GameCreated>(Apply);
        Recover<MoveMade>(e => Apply(e, replay: true));
        Recover<DrawOffered>(Apply);
        Recover<DrawDeclined>(Apply);
        Recover<GameEnded>(Apply);
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
        Command<FlagCheck>(_ => HandleFlagCheck());
        Command<AbortCheck>(_ => HandleAbortCheck());
        Command<PassivateNow>(_ => Context.Parent.Tell(new global::Akka.Cluster.Sharding.Passivate(PoisonPill.Instance)));
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

    /// <summary>Recovery (D14): the side to move gets its clock back as of the last event, and the turn restarts now.</summary>
    protected override void OnReplaySuccess()
    {
        if (ClocksRunning)
        {
            _turnStartedAt = _clock.GetUtcNow();
        }

        Rearm();
    }

    private string Topic => LiveTopics.Format("game", _gameId.ToString("N"));

    private int Ply => _rules.Moves.Count;

    // ---- commands ----------------------------------------------------------------------------------------------

    private void HandleCreate(CreateGame cmd)
    {
        if (_created)
        {
            bool same = cmd.WhiteId == _white && cmd.BlackId == _black && cmd.TimeControl == _timeControl;
            Reply(same ? View() : Rejected(RejectionCode.Conflict, "A different game already exists with this id."));
            return;
        }

        if (cmd.WhiteId == cmd.BlackId)
        {
            Reply(Rejected(RejectionCode.Conflict, "A game needs two different players."));
            return;
        }

        TimeControl tc = cmd.TimeControl;
        PersistAndReply([new GameCreated(cmd.WhiteId, cmd.BlackId, tc.ToString(), tc.InitialMs, tc.IncrementMs, _clock.GetUtcNow())]);
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

        DateTimeOffset now = _clock.GetUtcNow();
        if (ClocksRunning && RemainingMs(now) <= 0)
        {
            // The flag fell before this move arrived; the timer just hadn't fired yet.
            PersistAndReply([TimedOut(now)]);
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

        PersistAll([TimedOut(now)], e =>
        {
            ApplyLive(e);
            Publish();
            MaybeSnapshot();
            Rearm();
        });
    }

    private void HandleAbortCheck()
    {
        if (_status == GameStatus.Ended || Ply >= 2)
        {
            return;
        }

        DateTimeOffset now = _clock.GetUtcNow();
        if (now < FirstMoveDeadline)
        {
            Rearm();
            return;
        }

        PersistAll([Ended(GameResult.None, EndReason.Aborted, now)], e =>
        {
            ApplyLive(e);
            Publish();
            MaybeSnapshot();
            Rearm();
        });
    }

    /// <summary>Common gate: the game must exist, the sender must be a player (D10), and it must not be over.</summary>
    private GameRejected? Refuse(long userId) =>
        !_created ? NotFound()
        : userId != _white && userId != _black ? Rejected(RejectionCode.Forbidden, "Only the two players can act in this game.")
        : _status == GameStatus.Ended ? Rejected(RejectionCode.Conflict, "The game is over.")
        : null;

    // ---- persistence -------------------------------------------------------------------------------------------

    private void PersistAndReply(IReadOnlyList<object> events)
    {
        IActorRef replyTo = Sender;
        PersistAll(events, e =>
        {
            ApplyLive(e);
            Publish();
            MaybeSnapshot();
            Rearm();
        });
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
            default:
                throw new InvalidOperationException($"Unknown game event {e.GetType().Name}.");
        }
    }

    private void Apply(GameCreated e)
    {
        _created = true;
        _white = e.WhiteId;
        _black = e.BlackId;
        _timeControl = TimeControl.TryParse(e.TimeControl, out TimeControl tc)
            ? tc
            : throw new InvalidOperationException($"Unknown time control {e.TimeControl} in the journal.");
        _whiteMs = e.InitialMs;
        _blackMs = e.InitialMs;
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
        // From Black's first reply on, the side to move's clock runs from the moment of the last move.
        _turnStartedAt = Ply >= 2 ? e.At : null;
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

    private void Restore(GameSnapshot s)
    {
        _created = true;
        _white = s.WhiteId;
        _black = s.BlackId;
        _timeControl = TimeControl.TryParse(s.TimeControl, out TimeControl tc)
            ? tc
            : throw new InvalidOperationException($"Unknown time control {s.TimeControl} in a snapshot.");
        _rules = ChessRules.Replay(s.Moves);
        _lastSan = s.LastSan;
        _whiteMs = s.WhiteMs;
        _blackMs = s.BlackMs;
        _status = s.Status;
        _drawOfferedBy = s.DrawOfferedBy;
        _drawBlocked = s.DrawBlocked;
        _result = s.Result;
        _reason = s.Reason;
        _createdAt = s.CreatedAt;
        _lastMoveAt = s.LastMoveAt;
        _turnStartedAt = _status == GameStatus.Playing && Ply >= 2 ? s.LastMoveAt : null;
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
            _drawOfferedBy, _drawBlocked, _result, _reason, _createdAt, _lastMoveAt));
    }

    private void Publish() => _mediator?.Tell(new Publish(LiveTopics.PubSub, new LiveFrame(Topic, LastSequenceNr, View())));

    // ---- helpers -----------------------------------------------------------------------------------------------

    private GameEnded Ended(GameResult result, EndReason reason, DateTimeOffset at) =>
        new(result.ToPgn(), reason.ToString(), CurrentMs(Side.White, at), CurrentMs(Side.Black, at), at);

    private GameEnded TimedOut(DateTimeOffset at)
    {
        GameOutcome outcome = TimeoutOutcome(_rules, _rules.SideToMove);
        return Ended(outcome.Result, outcome.Reason, at);
    }

    private bool ClocksRunning => _status == GameStatus.Playing && _turnStartedAt is not null;

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
        DateTimeOffset now = _clock.GetUtcNow();
        if (_status == GameStatus.Ended)
        {
            if (PassivationPolicy.For(_timeControl).AfterEnd is { } after)
            {
                Timers.StartSingleTimer(PassivateTimer, PassivateNow.Instance, after);
            }

            return;
        }

        if (ClocksRunning)
        {
            Timers.StartSingleTimer(FlagTimer, FlagCheck.Instance, TimeSpan.FromMilliseconds(RemainingMs(now)));
            return;
        }

        TimeSpan untilAbort = FirstMoveDeadline - now;
        Timers.StartSingleTimer(AbortTimer, AbortCheck.Instance, untilAbort > TimeSpan.Zero ? untilAbort : TimeSpan.Zero);
    }

    private long PlayerToMove => _rules.SideToMove == Side.White ? _white : _black;

    private Side SideOf(long userId) => userId == _white ? Side.White : Side.Black;

    private long Opponent(long userId) => userId == _white ? _black : _white;

    private GameView View() => new(
        _gameId, _white, _black, _timeControl.ToString(), _status, _rules.Fen, Ply, _rules.SideToMove.ToString(),
        _rules.Moves.Count > 0 ? _rules.Moves[^1] : null, _lastSan,
        CurrentMs(Side.White, _clock.GetUtcNow()), CurrentMs(Side.Black, _clock.GetUtcNow()), _clock.GetUtcNow(),
        _drawOfferedBy, _result, _reason, LastSequenceNr);

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

    private sealed class PassivateNow
    {
        public static readonly PassivateNow Instance = new();
    }
}
