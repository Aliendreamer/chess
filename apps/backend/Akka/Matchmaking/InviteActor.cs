using Akka.Cluster.Sharding;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.Event;
using Akka.Persistence;
using Chess.Backend.Akka.Games;
using Chess.Backend.Events;
using Chess.Backend.Extensions;
using Chess.Backend.Games;
using Chess.Backend.Messaging;

namespace Chess.Backend.Akka.Matchmaking;

internal interface IInviteCommand
{
    Guid InviteId { get; }
}

internal sealed record CreateInvite(Guid InviteId, long CreatorId, string TimeControl, string Color) : IInviteCommand;

internal sealed record AcceptInvite(Guid InviteId, long UserId) : IInviteCommand;

internal sealed record CancelInvite(Guid InviteId, long UserId) : IInviteCommand;

internal sealed record GetInvite(Guid InviteId) : IInviteCommand;

/// <summary>
/// A player of a finished game asks for a rematch (game-feedback). The invite's id is the game's id. The first offer
/// creates it, reserved for <see cref="OpponentId"/>, with the caller on <see cref="Color"/>; the guest's offer accepts
/// it; the creator's repeated offer returns it unchanged.
/// </summary>
internal sealed record OfferRematch(Guid InviteId, long UserId, long OpponentId, string TimeControl, string Color) : IInviteCommand;

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
}

internal sealed record InviteRejected(Guid InviteId, RejectionCode Code, string Reason);

/// <summary>
/// An invite as the creator, the friend and the <c>invite:{id}</c> live topic see it; <see cref="GameId"/> once
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
    long? ForId = null);

/// <summary>
/// One invite link (ROADMAP D17, game-matchmaking): sharded and persistent, keyed by a random v4 id because the link
/// is a bearer secret. Expiry is derived from the clock on every command and read, so no timer has to survive
/// passivation. Accepting starts the game through <see cref="IGameStarter"/>; while that is in flight every other
/// command is stashed, so two accepts can never start two games.
/// </summary>
internal sealed class InviteActor : ReceivePersistentActor
{
    protected override bool AroundReceive(Receive receive, object message) =>
        ActorTracing.Receive(ActorNames.Invite, message, m => base.AroundReceive(receive, m), entity: new(TelemetryTags.InviteId, _inviteId.ToString("N")));

    protected override void OnReplaySuccess()
    {
        ActorMetrics.Recovered(ActorNames.Invite, _startedAt);
        base.OnReplaySuccess();
    }

    public const string PersistenceIdPrefix = "invite-";

    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(24);

    private readonly Guid _inviteId;

    /// <summary>When this incarnation started, for its recovery time.</summary>
    private readonly long _startedAt = System.Diagnostics.Stopwatch.GetTimestamp();
    private readonly IGameStarter _starter;
    private readonly IActorRef? _mediator;
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

    public InviteActor(Guid inviteId, IGameStarter starter, IActorRef? mediator, TimeProvider clock, Random random)
    {
        ArgumentNullException.ThrowIfNull(starter);
        ArgumentNullException.ThrowIfNull(clock);
        ArgumentNullException.ThrowIfNull(random);
        _inviteId = inviteId;
        _starter = starter;
        _mediator = mediator;
        _clock = clock;
        _random = random;

        Recover<InviteCreated>(Apply);
        Recover<InviteAccepted>(Apply);
        Recover<InviteCancelled>(Apply);

        Command<CreateInvite>(HandleCreate);
        Command<GetInvite>(_ => Sender.Tell(_created ? View() : NotFound()));
        Command<AcceptInvite>(HandleAccept);
        Command<CancelInvite>(HandleCancel);
        Command<OfferRematch>(HandleOfferRematch);
    }

    public override string PersistenceId => PersistenceIdPrefix + _inviteId.ToString("N");

    private InviteStatus Status =>
        _gameId is not null ? InviteStatus.Accepted
        : _cancelled ? InviteStatus.Cancelled
        : _clock.GetUtcNow() >= _createdAt + Lifetime ? InviteStatus.Expired
        : InviteStatus.Open;

    private void HandleCreate(CreateInvite cmd)
    {
        if (_created)
        {
            Sender.Tell(Rejected(RejectionCode.Conflict, "This invite already exists."));
            return;
        }

        Create(new InviteCreated(cmd.CreatorId, cmd.TimeControl, cmd.Color, _clock.GetUtcNow()));
    }

    private void HandleOfferRematch(OfferRematch cmd)
    {
        if (!_created)
        {
            Create(new InviteCreated(cmd.UserId, cmd.TimeControl, cmd.Color, _clock.GetUtcNow(), cmd.OpponentId, cmd.InviteId));
        }
        else if (cmd.UserId == _creator)
        {
            Sender.Tell(View());
        }
        else if (cmd.UserId == _forId)
        {
            HandleAccept(new AcceptInvite(cmd.InviteId, cmd.UserId));
        }
        else
        {
            Sender.Tell(Rejected(RejectionCode.Forbidden, "This rematch is between the two players."));
        }
    }

    private void Create(InviteCreated created)
    {
        if (!TimeControl.TryParseInvite(created.TimeControl, out _) || !SideNames.IsChoice(created.Color))
        {
            Sender.Tell(Rejected(RejectionCode.Illegal, "An invite needs a preset time control or 7d, and a colour (white, black or random)."));
            return;
        }

        IActorRef replyTo = Sender;
        Persist(ActorTracing.Stamp(created), ActorTracing.Persisting<InviteCreated>(ActorNames.Invite, 1, e =>
        {
            Apply(e);
            Published(replyTo, e);
        }));
    }

    private void HandleAccept(AcceptInvite cmd)
    {
        if (!_created)
        {
            Sender.Tell(NotFound());
            return;
        }

        if (Status != InviteStatus.Open)
        {
            Sender.Tell(Rejected(RejectionCode.Conflict, $"This invite is {Status.WireName()}."));
            return;
        }

        if (cmd.UserId == _creator)
        {
            Sender.Tell(Rejected(RejectionCode.Conflict, "You can't accept your own invite; share the link instead."));
            return;
        }

        if (_forId is not null && cmd.UserId != _forId)
        {
            Sender.Tell(Rejected(RejectionCode.Forbidden, "This invite is for someone else."));
            return;
        }

        // The random colour is resolved once, here, and never again.
        bool creatorIsWhite = _color switch
        {
            SideNames.White => true,
            SideNames.Black => false,
            _ => _random.Next(2) == 0,
        };
        long white = creatorIsWhite ? _creator : cmd.UserId;
        long black = creatorIsWhite ? cmd.UserId : _creator;
        IActorRef replyTo = Sender;
        _starter.StartAsync(white, black, _tc, CancellationToken.None).PipeTo(
            Self,
            success: view => ActorTracing.Wrap(new Started(cmd.UserId, view.GameId, replyTo)),
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

    private void HandleCancel(CancelInvite cmd)
    {
        if (!_created)
        {
            Sender.Tell(NotFound());
            return;
        }

        if (cmd.UserId != _creator)
        {
            Sender.Tell(Rejected(RejectionCode.Forbidden, "Only the creator can cancel an invite."));
            return;
        }

        if (Status != InviteStatus.Open)
        {
            Sender.Tell(Rejected(RejectionCode.Conflict, $"This invite is {Status.WireName()}."));
            return;
        }

        IActorRef replyTo = Sender;
        Persist(ActorTracing.Stamp(new InviteCancelled(_clock.GetUtcNow())), ActorTracing.Persisting<InviteCancelled>(ActorNames.Invite, 1, e =>
        {
            Apply(e);
            Published(replyTo, e);
        }));
    }

    private void Apply(InviteCreated e)
    {
        _created = true;
        _creator = e.CreatorId;
        _timeControl = e.TimeControl;
        _tc = TimeControl.TryParseInvite(e.TimeControl, out TimeControl tc)
            ? tc
            : throw new InvalidOperationException($"Unknown time control {e.TimeControl} in invite {_inviteId:N}.");
        _color = e.Color;
        _createdAt = e.At;
        _forId = e.ForId;
    }

    private void Apply(InviteAccepted e) => _gameId = e.GameId;

    private void Apply(InviteCancelled e) => _cancelled = true;

    /// <summary>Replies with the post-persist view and publishes it on the invite's live topic.</summary>
    private void Published(IActorRef replyTo, object cause)
    {
        InviteView view = View();
        replyTo.Tell(view);
        _mediator?.Tell(new Publish(LiveTopics.PubSub, InviteLiveSource.ToFrame(view) with { Trace = ActorTracing.TraceOf(cause) }));
    }

    private InviteView View() => new(
        _inviteId, _creator, _timeControl, _color, Status, _gameId, _createdAt, _createdAt + Lifetime, LastSequenceNr, _forId);

    private InviteRejected NotFound() => Rejected(RejectionCode.NotFound, "No such invite.");

    private InviteRejected Rejected(RejectionCode code, string reason) => new(_inviteId, code, reason);

    private sealed record Started(long ById, Guid GameId, IActorRef ReplyTo);

    private sealed record StartFailed(IActorRef ReplyTo, Exception Cause);
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
