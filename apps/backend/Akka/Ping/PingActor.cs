using System.Diagnostics;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.Event;
using Akka.Persistence;
using Chess.Backend.Events;
using Chess.Backend.Live;

namespace Chess.Backend.Akka.Ping;

/// <summary>
/// The proving entity: validate → Persist(Pinged) → DistributedPubSub → reply with state.
/// Kafka is NOT published from here: <see cref="Outbox.JournalPublisher"/> tails the journal, so a persisted event
/// reaches Kafka even if this node dies right after the write. One incarnation per ping id cluster-wide
/// (sharding); passivation is configured by the shard region.
/// </summary>
internal sealed class PingActor : ReceivePersistentActor
{
    public const int SnapshotEvery = 20;
    public const string PersistenceIdPrefix = "ping-";
    private const int MaxTextLength = 200;

    private readonly string _pingId;
    private readonly IActorRef? _mediator;
    private readonly ILoggingAdapter _log = Context.GetLogger();
    private long _count;
    private string? _lastText;
    private DateTimeOffset? _lastAt;

    public PingActor(string pingId, IActorRef? mediator)
    {
        ArgumentNullException.ThrowIfNull(pingId);

        _pingId = pingId;
        _mediator = mediator;

        Recover<Pinged>(Apply);
        Recover<SnapshotOffer>(offer =>
        {
            if (offer.Snapshot is PingSnapshot s)
            {
                _count = s.Count;
                _lastText = s.LastText;
                _lastAt = s.LastAt;
            }
        });

        Command<GetPingState>(_ => Sender.Tell(State()));
        Command<Ping>(HandlePing);
        Command<SaveSnapshotSuccess>(_ => { });
        Command<SaveSnapshotFailure>(f => _log.Warning(f.Cause, "snapshot failed for {0}", _pingId));
    }

    public override string PersistenceId => PersistenceIdPrefix + _pingId;

    private void HandlePing(Ping cmd)
    {
        if (string.IsNullOrWhiteSpace(cmd.Text))
        {
            Sender.Tell(new PingRejected(_pingId, "Text is required."));
            return;
        }

        if (cmd.Text.Length > MaxTextLength)
        {
            Sender.Tell(new PingRejected(_pingId, $"Text must be at most {MaxTextLength} characters."));
            return;
        }

        Pinged evt = new(cmd.Text.Trim(), cmd.UserId, DateTimeOffset.UtcNow);
        IActorRef replyTo = Sender;
        Persist(evt, persisted =>
        {
            Apply(persisted);
            long seq = LastSequenceNr;
            using Activity? activity = ActorTracing.StartPingHandle(_pingId, seq);
            PingState state = State();
            _mediator?.Tell(new Publish(LiveTopics.PubSub, PingLiveSource.ToFrame(state)));
            replyTo.Tell(state);
            if (seq % SnapshotEvery == 0)
            {
                SaveSnapshot(new PingSnapshot(_count, _lastText, _lastAt));
            }
        });
    }

    private void Apply(Pinged evt)
    {
        _count++;
        _lastText = evt.Text;
        _lastAt = evt.At;
    }

    private PingState State() => new(_pingId, _count, _lastText, _lastAt, LastSequenceNr);
}
