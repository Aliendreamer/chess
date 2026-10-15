using Akka.Cluster.Sharding;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.Event;
using Akka.Persistence;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Presence;
using Chess.Backend.Events;
using Chess.Backend.Extensions;
using Chess.Backend.Games;
using Chess.Backend.Messaging;

namespace Chess.Backend.Akka.Matchmaking;

internal interface IInviteCommand
{
    Guid InviteId { get; }
}

internal sealed record GetInvite(Guid InviteId) : IInviteCommand;

/// <summary>
/// A player of a finished game asks for a rematch (game-feedback). The invite's id is the game's id. The first offer
/// creates it, reserved for <see cref="OpponentId"/>, with the caller on <see cref="Color"/>; the guest's offer accepts
/// it; the creator's repeated offer returns it unchanged.
/// </summary>
internal sealed record OfferRematch(Guid InviteId, long UserId, long OpponentId, string TimeControl, string Color) : IInviteCommand;

/// <summary>
/// A member challenges another to a preset game (club-members D2): a new invite reserved for <see cref="OpponentId"/>,
/// with the challenger on <see cref="Color"/> (<c>white</c>, <c>black</c> or <c>random</c>), open for
/// <see cref="Challenge.Lifetime"/>. The presence singleton has already reserved both ends.
/// </summary>
internal sealed record OfferChallenge(Guid InviteId, long UserId, long OpponentId, string TimeControl, string Color) : IInviteCommand;

/// <summary>The challenged member takes the challenge: the game starts.</summary>
internal sealed record AcceptChallenge(Guid InviteId, long UserId) : IInviteCommand;

/// <summary>The challenged member says no.</summary>
internal sealed record DeclineChallenge(Guid InviteId, long UserId) : IInviteCommand;

/// <summary>The challenger withdraws; <see cref="UserId"/> null is the club withdrawing it (a member deactivated).</summary>
internal sealed record CancelChallenge(Guid InviteId, long? UserId) : IInviteCommand;

/// <summary>A challenge's game rules (club-members D2): kept in code, like the other game timings.</summary>
internal static class Challenge
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromSeconds(60);
}

/// <summary>What an invite is for; lower-case on the wire.</summary>
[System.Text.Json.Serialization.JsonConverter(typeof(WireEnumConverter<InviteKind>))]
internal enum InviteKind
{
    Rematch,
    Challenge,
}

/// <summary>Who may ask for a rematch of a game, and the offer it becomes (game-feedback).</summary>
internal static class Rematch
{
    /// <summary>The <see cref="OfferRematch"/> for <paramref name="userId"/> after <paramref name="game"/>, or an <see cref="InviteRejected"/>.</summary>
    public static object Offer(GameView game, long userId)
    {
        ArgumentNullException.ThrowIfNull(game);
        if (userId != game.WhiteId && userId != game.BlackId)
        {
            return new InviteRejected(game.GameId, RejectionCode.Forbidden, "Only the two players can ask for a rematch.");
        }

        if (game.EngineSide is not null)
        {
            return new InviteRejected(game.GameId, RejectionCode.Illegal, "Against the computer, start a new game instead.");
        }

        if (game.Status != GameStatus.Ended)
        {
            return new InviteRejected(game.GameId, RejectionCode.Conflict, "The game is still on.");
        }

        bool wasWhite = userId == game.WhiteId;
        return new OfferRematch(game.GameId, userId, wasWhite ? game.BlackId : game.WhiteId, game.TimeControl, wasWhite ? SideNames.Black : SideNames.White);
    }
}

/// <summary>Where an invite stands; lower-case on the wire.</summary>
[System.Text.Json.Serialization.JsonConverter(typeof(WireEnumConverter<InviteStatus>))]
internal enum InviteStatus
{
    Open,
    Accepted,
    Cancelled,
    Expired,
    Declined,
}

internal sealed record InviteRejected(Guid InviteId, RejectionCode Code, string Reason);

/// <summary>
/// An invite as the two players and the <c>invite:{id}</c> live topic see it; <see cref="GameId"/> once
/// <see cref="InviteStatus.Accepted"/>.
/// </summary>
internal sealed record InviteView(
    Guid InviteId,
    long CreatorId,
    string TimeControl,
    string Color,
    InviteStatus Status,
    Guid? GameId,
    DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt,
    long Seq,
    long? ForId = null,
    InviteKind Kind = InviteKind.Rematch);

/// <summary>
/// One invite (ROADMAP D17, game-matchmaking): sharded and persistent. Two kinds are made now: rematches
/// (game-feedback), keyed by the finished game's id, open 24 h, and challenges (club-members D2), with a new id, open
/// 60 s. Both are reserved for one member. Older invites in the journal (random v4 ids, possibly cancelled or with a
/// random colour) still recover and read. A rematch's expiry is derived from the clock on every command and read; a
/// challenge's is also persisted by a timer, so the <c>expired</c> frame is pushed when it runs out, and every end of a
/// challenge releases its reservation in the presence singleton. Accepting starts the game through
/// <see cref="IGameStarter"/>; while that is in flight every other command is stashed, so two accepts can never start
/// two games.
/// </summary>
internal sealed class InviteActor : ReceivePersistentActor, IWithTimers
{
    protected override bool AroundReceive(Receive receive, object message) => ActorTracing.Receive(
        ActorNames.Invite,
        message,
        m => base.AroundReceive(receive, m),
        m => m is ExpiryCheck,
        new(TelemetryTags.InviteId, _inviteId.ToString("N")));

    protected override void OnReplaySuccess()
    {
        ActorMetrics.Recovered(ActorNames.Invite, _startedAt);
        ArmExpiry();
        base.OnReplaySuccess();
    }

    private const string ExpiryTimer = "expiry";

    public const string PersistenceIdPrefix = "invite-";

    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(24);

    private readonly Guid _inviteId;

    /// <summary>When this incarnation started, for its recovery time.</summary>
    private readonly long _startedAt = System.Diagnostics.Stopwatch.GetTimestamp();
    private readonly IGameStarter _starter;
    private readonly IActorRef? _mediator;
    private readonly IActorRef? _presence;
    private readonly TimeProvider _clock;
    private readonly Random _random;
    private readonly ILoggingAdapter _log = Context.GetLogger();

    private bool _created;
    private long _creator;
    private string _timeControl = string.Empty;
    private TimeControl _tc;
    private string _color = string.Empty;
    private long? _forId;
    private DateTimeOffset _createdAt;
    private Guid? _gameId;
    private bool _cancelled;
    private bool _declined;
    private bool _expired;
    private InviteKind _kind;
    private TimeSpan _lifetime = Lifetime;

    public InviteActor(Guid inviteId, IGameStarter starter, IActorRef? mediator, TimeProvider clock, Random random)
        : this(inviteId, starter, mediator, clock, random, presence: null)
    {
    }

    public InviteActor(Guid inviteId, IGameStarter starter, IActorRef? mediator, TimeProvider clock, Random random, IActorRef? presence)
    {
        ArgumentNullException.ThrowIfNull(starter);
        ArgumentNullException.ThrowIfNull(clock);
        ArgumentNullException.ThrowIfNull(random);
        _inviteId = inviteId;
        _starter = starter;
        _mediator = mediator;
        _clock = clock;
        _random = random;
        _presence = presence;

        Recover<InviteCreated>(Apply);
        Recover<InviteAccepted>(Apply);
        Recover<InviteCancelled>(Apply);
        Recover<InviteDeclined>(Apply);
        Recover<InviteExpired>(Apply);

        Command<GetInvite>(_ => Sender.Tell(_created ? View() : NotFound()));
        Command<OfferRematch>(HandleOfferRematch);
        Command<OfferChallenge>(HandleOfferChallenge);
        Command<AcceptChallenge>(c => IfChallenge(c.UserId, forGuest: true, () => Accept(c.UserId)));
        Command<DeclineChallenge>(c => IfChallenge(c.UserId, forGuest: true, () => End(new InviteDeclined(c.UserId, _clock.GetUtcNow()))));
        Command<CancelChallenge>(HandleCancel);
        Command<ExpiryCheck>(_ => HandleExpiryCheck());
    }

    public ITimerScheduler Timers { get; set; } = null!;

    public override string PersistenceId => PersistenceIdPrefix + _inviteId.ToString("N");

    private InviteStatus Status =>
        _gameId is not null ? InviteStatus.Accepted
        : _cancelled ? InviteStatus.Cancelled
        : _declined ? InviteStatus.Declined
        : _expired || _clock.GetUtcNow() >= _createdAt + _lifetime ? InviteStatus.Expired
        : InviteStatus.Open;

    private void HandleOfferChallenge(OfferChallenge cmd)
    {
        if (_created)
        {
            // A retried offer of the same challenge reads it back; anything else under this id is a conflict.
            Sender.Tell(_kind == InviteKind.Challenge && cmd.UserId == _creator && cmd.OpponentId == _forId
                ? View()
                : Rejected(RejectionCode.Conflict, "A different invite already exists with this id."));
            return;
        }

        if (cmd.UserId == cmd.OpponentId)
        {
            Sender.Tell(Rejected(RejectionCode.Illegal, "You cannot challenge yourself."));
            return;
        }

        Create(new InviteCreated(
            cmd.UserId, cmd.TimeControl, cmd.Color, _clock.GetUtcNow(), cmd.OpponentId,
            Kind: InviteKind.Challenge.WireName(), LifetimeSeconds: (int)Challenge.Lifetime.TotalSeconds));
    }

    /// <summary>Runs <paramref name="action"/> when this is an open challenge and the caller is its guest (or creator).</summary>
    private void IfChallenge(long userId, bool forGuest, Action action)
    {
        if (!_created || _kind != InviteKind.Challenge)
        {
            Sender.Tell(Rejected(RejectionCode.NotFound, "No such challenge."));
        }
        else if (forGuest ? userId != _forId : userId != _creator)
        {
            Sender.Tell(Rejected(RejectionCode.Forbidden, forGuest ? "This challenge is for another member." : "Only the challenger can withdraw it."));
        }
        else if (Status != InviteStatus.Open)
        {
            Sender.Tell(Rejected(RejectionCode.Conflict, $"This challenge is {Status.WireName()}."));
        }
        else
        {
            action();
        }
    }

    private void HandleCancel(CancelChallenge cmd)
    {
        if (cmd.UserId is { } user)
        {
            IfChallenge(user, forGuest: false, () => End(new InviteCancelled(_clock.GetUtcNow())));
            return;
        }

        // The club withdraws it (a member was deactivated): either end, any state; an ended one just reads back.
        if (_created && _kind == InviteKind.Challenge && Status == InviteStatus.Open)
        {
            End(new InviteCancelled(_clock.GetUtcNow()));
        }
        else
        {
            Sender.Tell(_created ? View() : NotFound());
        }
    }

    /// <summary>Persists a challenge's ending, answers and publishes it, and releases the reservation.</summary>
    private void End(object ending, IActorRef? replyTo = null)
    {
        replyTo ??= Sender ?? ActorRefs.Nobody;
        Persist(ActorTracing.Stamp(ending), ActorTracing.Persisting<object>(ActorNames.Invite, 1, e =>
        {
            ApplyEnding(e);
            Published(replyTo, e);
            Release();
        }));
    }

    private void HandleExpiryCheck()
    {
        if (!_created || _kind != InviteKind.Challenge || _expired || _gameId is not null || _cancelled || _declined)
        {
            return;
        }

        DateTimeOffset now = _clock.GetUtcNow();
        if (now < _createdAt + _lifetime)
        {
            ArmExpiry(); // a clock that disagrees with the scheduler: look again when it is due
            return;
        }

        End(new InviteExpired(now), ActorRefs.Nobody);
    }

    /// <summary>An open challenge's timer, due when it runs out; recovery re-arms it (a past one fires at once).</summary>
    private void ArmExpiry()
    {
        if (!_created || _kind != InviteKind.Challenge || _expired || _gameId is not null || _cancelled || _declined)
        {
            return;
        }

        TimeSpan due = _createdAt + _lifetime - _clock.GetUtcNow();
        Timers.StartSingleTimer(ExpiryTimer, ExpiryCheck.Instance, due > TimeSpan.Zero ? due : TimeSpan.Zero);
    }

    /// <summary>Frees both members in the presence singleton (club-members D2); idempotent there.</summary>
    private void Release()
    {
        if (_kind == InviteKind.Challenge)
        {
            Timers.Cancel(ExpiryTimer);
            _presence?.Tell(new ReleaseChallenge(_inviteId));
        }
    }

    private void HandleOfferRematch(OfferRematch cmd)
    {
        if (_created && _kind == InviteKind.Challenge)
        {
            Sender.Tell(NotFound()); // a rematch's id is a game's; a challenge's never is
        }
        else if (!_created)
        {
            Create(new InviteCreated(cmd.UserId, cmd.TimeControl, cmd.Color, _clock.GetUtcNow(), cmd.OpponentId, cmd.InviteId));
        }
        else if (cmd.UserId == _creator)
        {
            Sender.Tell(View());
        }
        else if (cmd.UserId == _forId)
        {
            Accept(cmd.UserId);
        }
        else
        {
            Sender.Tell(Rejected(RejectionCode.Forbidden, "This rematch is between the two players."));
        }
    }

    private void Create(InviteCreated created)
    {
        if (!TimeControl.TryParse(created.TimeControl, out _) || !SideNames.IsChoice(created.Color))
        {
            Sender.Tell(Rejected(RejectionCode.Illegal, "An invite needs a preset time control and a colour (white, black or random)."));
            return;
        }

        IActorRef replyTo = Sender;
        Persist(ActorTracing.Stamp(created), ActorTracing.Persisting<InviteCreated>(ActorNames.Invite, 1, e =>
        {
            Apply(e);
            Published(replyTo, e);
            if (_kind == InviteKind.Challenge)
            {
                _presence?.Tell(new ChallengeOpened(_inviteId, _createdAt + _lifetime));
                ArmExpiry();
            }
        }));
    }

    /// <summary>The guest takes the reserved invite: the game starts with the creator's colour honoured.</summary>
    private void Accept(long userId)
    {
        if (Status != InviteStatus.Open)
        {
            Sender.Tell(Rejected(RejectionCode.Conflict, $"This invite is {Status.WireName()}."));
            return;
        }

        // A random colour (only in invites recorded before links were removed) is resolved once, here.
        bool creatorIsWhite = _color switch
        {
            SideNames.White => true,
            SideNames.Black => false,
            _ => _random.Next(2) == 0,
        };
        long white = creatorIsWhite ? _creator : userId;
        long black = creatorIsWhite ? userId : _creator;
        IActorRef replyTo = Sender;
        _starter.StartAsync(white, black, _tc, CancellationToken.None).PipeTo(
            Self,
            success: view => ActorTracing.Wrap(new Started(userId, view.GameId, replyTo)),
            failure: ex => ActorTracing.Wrap(new StartFailed(replyTo, ex)));
        BecomeStacked(Starting);
    }

    /// <summary>While the game is being started: everything else waits, so no second accept can slip in.</summary>
    private void Starting()
    {
        Command<Started>(s => Persist(ActorTracing.Stamp(new InviteAccepted(s.ById, s.GameId, _clock.GetUtcNow())), ActorTracing.Persisting<InviteAccepted>(ActorNames.Invite, 1, e =>
        {
            Apply(e);
            Published(s.ReplyTo, e);
            Release();
            UnbecomeStacked();
            Stash.UnstashAll();
        })));
        Command<StartFailed>(f =>
        {
            _log.Warning(f.Cause, "invite {0} could not start its game", _inviteId);
            f.ReplyTo.Tell(Rejected(RejectionCode.Conflict, "The game could not be started; try again."));
            UnbecomeStacked();
            Stash.UnstashAll();
        });
        CommandAny(_ => Stash.Stash());
    }

    private void Apply(InviteCreated e)
    {
        _created = true;
        _creator = e.CreatorId;
        _timeControl = e.TimeControl;
        _tc = TimeControl.TryParse(e.TimeControl, out TimeControl tc)
            ? tc
            : throw new InvalidOperationException($"Unknown time control {e.TimeControl} in invite {_inviteId:N}.");
        _color = e.Color;
        _createdAt = e.At;
        _forId = e.ForId;
        _kind = e.Kind == InviteKind.Challenge.WireName() ? InviteKind.Challenge : InviteKind.Rematch;
        _lifetime = e.LifetimeSeconds is { } seconds ? TimeSpan.FromSeconds(seconds) : Lifetime;
    }

    private void Apply(InviteAccepted e) => _gameId = e.GameId;

    private void Apply(InviteCancelled e) => _cancelled = true;

    private void Apply(InviteDeclined e) => _declined = true;

    private void Apply(InviteExpired e) => _expired = true;

    private void ApplyEnding(object e)
    {
        switch (e)
        {
            case InviteCancelled c:
                Apply(c);
                break;
            case InviteDeclined d:
                Apply(d);
                break;
            case InviteExpired x:
                Apply(x);
                break;
            default:
                throw new InvalidOperationException($"Unknown invite ending {e.GetType().Name}.");
        }
    }

    /// <summary>Replies with the post-persist view and publishes it on the invite's live topic.</summary>
    private void Published(IActorRef replyTo, object cause)
    {
        InviteView view = View();
        replyTo.Tell(view);
        _mediator?.Tell(new Publish(LiveTopics.PubSub, InviteLiveSource.ToFrame(view) with { Trace = ActorTracing.TraceOf(cause) }));
    }

    private InviteView View() => new(
        _inviteId, _creator, _timeControl, _color, Status, _gameId, _createdAt, _createdAt + _lifetime, LastSequenceNr, _forId, _kind);

    private InviteRejected NotFound() => Rejected(RejectionCode.NotFound, "No such invite.");

    private InviteRejected Rejected(RejectionCode code, string reason) => new(_inviteId, code, reason);

    private sealed record Started(long ById, Guid GameId, IActorRef ReplyTo);

    private sealed record StartFailed(IActorRef ReplyTo, Exception Cause);

    private sealed class ExpiryCheck
    {
        public static readonly ExpiryCheck Instance = new();
    }
}

/// <summary>The <c>invite</c> live kind: the snapshot is the invite's current view.</summary>
internal sealed partial class InviteLiveSource(IRequiredActor<InviteActor> region, IOptions<ApiOptions> api) : ILiveTopicSource
{
    public const string KindName = "invite";

    public string Kind => KindName;

    public bool IsValidId(string id) => IdPattern().IsMatch(id);

    public async Task<LiveFrame?> SnapshotAsync(string id, CancellationToken ct) =>
        await region.ActorRef.Ask(ActorTracing.Wrap(new GetInvite(Guid.ParseExact(id, "N"))), api.Value.AskTimeout, ct) is InviteView view ? ToFrame(view) : null;

    public static LiveFrame ToFrame(InviteView view)
    {
        ArgumentNullException.ThrowIfNull(view);
        return new LiveFrame(LiveTopics.Format(KindName, view.InviteId.ToString("N")), view.Seq, view);
    }

    [System.Text.RegularExpressions.GeneratedRegex("^[0-9a-f]{32}$")]
    private static partial System.Text.RegularExpressions.Regex IdPattern();
}

internal sealed class InviteMessageExtractor(int shardCount) : HashCodeMessageExtractor(shardCount)
{
    public override string? EntityId(object message) => ActorTracing.Unwrap(message) is IInviteCommand c ? c.InviteId.ToString("N") : null;
}
