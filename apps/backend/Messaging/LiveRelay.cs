using Akka.Cluster.Tools.PublishSubscribe;
using Akka.Event;
using Chess.Backend.Akka.Games;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Done = Akka.Done;

namespace Chess.Backend.Messaging;

/// <summary>
/// The one unit of live state on the wire (DistributedPubSub → hub → relay → browser). <see cref="Topic"/> is
/// <c>"{kind}:{id}"</c>, <see cref="Seq"/> is the aggregate's journal sequence (the browser drops anything not newer
/// than what it shows), and <see cref="Payload"/> is kind-specific. Nothing between the actor and the browser reads it.
/// </summary>
internal sealed record LiveFrame(string Topic, long Seq, object Payload);

internal static class LiveTopics
{
    /// <summary>DistributedPubSub topic every live aggregate publishes its frames to.</summary>
    public const string PubSub = "live";

    /// <summary>SignalR client method a pushed frame arrives on.</summary>
    public const string FrameMethod = "frame";

    public static string Format(string kind, string id) => $"{kind}:{id}";

    /// <summary>Splits on the first ':'; both halves must be non-empty. Id rules are the kind's business.</summary>
    public static bool TryParse(string? topic, out string kind, out string id)
    {
        kind = id = string.Empty;
        int colon = topic?.IndexOf(':', StringComparison.Ordinal) ?? -1;
        if (topic is null || colon <= 0 || colon == topic.Length - 1)
        {
            return false;
        }

        (kind, id) = (topic[..colon], topic[(colon + 1)..]);
        return true;
    }
}

/// <summary>One per live kind (ping now, game in Part 1): validates ids and supplies the current state on subscribe.</summary>
internal interface ILiveTopicSource
{
    string Kind { get; }

    bool IsValidId(string id);

    /// <summary>The aggregate's current frame, or null when there is nothing to show yet.</summary>
    Task<LiveFrame?> SnapshotAsync(string id, CancellationToken ct);
}

/// <summary>Maps a topic to its kind's source; a topic with an unknown kind or an invalid id resolves to nothing.</summary>
internal sealed class LiveTopicResolver
{
    private readonly Dictionary<string, ILiveTopicSource> _byKind;

    public LiveTopicResolver(IEnumerable<ILiveTopicSource> sources)
    {
        ArgumentNullException.ThrowIfNull(sources);
        _byKind = new Dictionary<string, ILiveTopicSource>(StringComparer.Ordinal);
        foreach (ILiveTopicSource source in sources)
        {
            if (!_byKind.TryAdd(source.Kind, source))
            {
                throw new InvalidOperationException($"Two live sources registered for kind '{source.Kind}'.");
            }
        }
    }

    public bool TryResolve(string? topic, [NotNullWhen(true)] out ILiveTopicSource? source, out string id)
    {
        source = null;
        if (!LiveTopics.TryParse(topic, out string kind, out id)
            || !_byKind.TryGetValue(kind, out ILiveTopicSource? found)
            || !found.IsValidId(id))
        {
            return false;
        }

        source = found;
        return true;
    }
}

/// <summary>
/// The one live hub (ROADMAP D5). Only the BFF connects, with its <c>chess_bff</c> service token (role
/// <see cref="Constants.Roles.Relay"/>); it authorizes browsers itself and multiplexes them over one connection.
/// <see cref="Subscribe"/> joins the topic's group first and only then reads the snapshot, so nothing published
/// after the join can be missed; the browser drops the duplicate by seq.
/// </summary>
[Authorize(Roles = Constants.Roles.Relay)]
[ExcludeFromCodeCoverage]
internal sealed class LiveHub(LiveTopicResolver topics, IRequiredActor<GameActor> games) : Hub
{
    private const int MaxInstanceLength = 64;

    public const string Path = "/hub/live";

    public async Task<LiveFrame?> Subscribe(string topic)
    {
        if (!topics.TryResolve(topic, out ILiveTopicSource? source, out string id))
        {
            throw new HubException("Unknown live topic.");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, topic);
        return await source.SnapshotAsync(id, Context.ConnectionAborted);
    }

    public Task Unsubscribe(string topic) => Groups.RemoveFromGroupAsync(Context.ConnectionId, topic);

    /// <summary>
    /// The BFF's presence report for a signed-in user on a game topic (presence-and-abandonment D1–D2); re-sent every
    /// 30 s as a lease. Only <c>game</c> topics carry presence; anything else is ignored. The game decides who plays.
    /// </summary>
    public void Present(string topic, long userId, string instance) => Report(topic, userId, instance, present: true);

    public void Absent(string topic, long userId, string instance) => Report(topic, userId, instance, present: false);

    private void Report(string topic, long userId, string instance, bool present)
    {
        if (string.IsNullOrEmpty(instance) || instance.Length > MaxInstanceLength
            || !topics.TryResolve(topic, out ILiveTopicSource? source, out string id)
            || source.Kind != GameLiveSource.KindName
            || !Guid.TryParseExact(id, "N", out Guid gameId))
        {
            return;
        }

        games.ActorRef.Tell(new ReportPresence(gameId, userId, instance, present));
    }
}

/// <summary>
/// One per node: subscribes to the cluster-wide <see cref="LiveTopics.PubSub"/> topic and pushes every
/// <see cref="LiveFrame"/> to the hub group named by its topic on THIS node, so a relay connected to any node sees
/// every aggregate wherever its actor lives. Kind-agnostic: it never looks at the payload. A faulted push is logged
/// (with the topic) via <see cref="PushFailed"/> rather than left as an unhandled <c>Status.Failure</c>.
/// </summary>
internal sealed class HubFanOutActor : ReceiveActor
{
    private readonly ILoggingAdapter _log = Context.GetLogger();

    public HubFanOutActor(IHubContext<LiveHub> hub, IActorRef mediator)
    {
        ArgumentNullException.ThrowIfNull(hub);
        ArgumentNullException.ThrowIfNull(mediator);

        mediator.Tell(new Subscribe(LiveTopics.PubSub, Self));
        Receive<SubscribeAck>(_ => { });
        Receive<LiveFrame>(frame =>
        {
            string topic = frame.Topic;
            hub.Clients.Group(topic).SendAsync(LiveTopics.FrameMethod, frame)
                .PipeTo(Self, success: () => Done.Instance, failure: ex => new PushFailed(topic, ex));
        });
        Receive<Done>(_ => { });
        Receive<PushFailed>(f => _log.Warning(f.Cause, "signalr push failed for {0}", f.Topic));
    }

    private sealed record PushFailed(string Topic, Exception Cause);
}
