using Akka.Cluster.Tools.PublishSubscribe;
using Akka.Event;
using Chess.Backend.Live;
using Microsoft.AspNetCore.SignalR;
using Done = Akka.Done;

namespace Chess.Backend.WebApi.Live;

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
