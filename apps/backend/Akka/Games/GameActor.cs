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
internal sealed class GameActor : ReceivePersistentActor
{
    public const string PersistenceIdPrefix = "game-";
    public const int SnapshotEvery = 20;

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
        Command<SaveSnapshotSuccess>(_ => { });
        Command<SaveSnapshotFailure>(f => _log.Warning(f.Cause, "snapshot failed for game {0}", _gameId));
    }

    public override string PersistenceId => PersistenceIdPrefix + _gameId.ToString("N");

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

        // TryApply mutates the board on success, so the persist callback must not apply the move again (replay: false).
        MoveOutcome outcome = _rules.TryApply(cmd.Uci);
        if (outcome is MoveRejected rejected)
        {
            Reply(Rejected(RejectionCode.Illegal, rejected.Reason));
            return;
        }

        MoveApplied applied = (MoveApplied)outcome;

        DateTimeOffset now = _clock.GetUtcNow();
        MoveMade moved = new(Ply, applied.Uci, applied.San, applied.FenAfter, _whiteMs, _blackMs, now);
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
            _drawOfferedBy, _drawBlocked, _result, _reason));
    }

    private void Publish() => _mediator?.Tell(new Publish(LiveTopics.PubSub, new LiveFrame(Topic, LastSequenceNr, View())));

    // ---- helpers -----------------------------------------------------------------------------------------------

    private GameEnded Ended(GameResult result, EndReason reason, DateTimeOffset at) =>
        new(result.ToPgn(), reason.ToString(), _whiteMs, _blackMs, at);

    private long PlayerToMove => _rules.SideToMove == Side.White ? _white : _black;

    private Side SideOf(long userId) => userId == _white ? Side.White : Side.Black;

    private long Opponent(long userId) => userId == _white ? _black : _white;

    private GameView View() => new(
        _gameId, _white, _black, _timeControl.ToString(), _status, _rules.Fen, Ply, _rules.SideToMove.ToString(),
        _rules.Moves.Count > 0 ? _rules.Moves[^1] : null, _lastSan, _whiteMs, _blackMs, _clock.GetUtcNow(),
        _drawOfferedBy, _result, _reason, LastSequenceNr);

    private GameRejected NotFound() => Rejected(RejectionCode.NotFound, "No such game.");

    private GameRejected Rejected(RejectionCode code, string reason) => new(_gameId, code, reason);

    private void Reply(object message) => Sender.Tell(message);
}
