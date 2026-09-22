using Akka.Cluster.Tools.PublishSubscribe;
using Akka.Event;
using Chess.Backend.Akka.Ping;
using Microsoft.AspNetCore.SignalR;
using Done = Akka.Done;

namespace Chess.Backend.WebApi.Hubs;

/// <summary>
/// One per node: subscribes to the cluster-wide `pings` topic and pushes every state to that ping's hub
/// group on THIS node. Subscribers connected to any node therefore see every actor, wherever it lives.
/// A faulted push is logged (with the ping id) via <see cref="PushFailed"/> rather than left as an
/// unhandled <c>Status.Failure</c>, which Akka's <c>PipeTo</c> would otherwise deliver silently.
/// </summary>
internal sealed class HubFanOutActor : ReceiveActor
{
    private readonly ILoggingAdapter _log = Context.GetLogger();

    public HubFanOutActor(IHubContext<PingsHub> hub, IActorRef mediator)
    {
        ArgumentNullException.ThrowIfNull(hub);
        ArgumentNullException.ThrowIfNull(mediator);

        mediator.Tell(new Subscribe(PingTopics.PubSub, Self));
        Receive<SubscribeAck>(_ => { });
        Receive<PingState>(state =>
        {
            string pingId = state.PingId;
            hub.Clients.Group(HubGroups.Ping(pingId)).SendAsync(PingsHub.StateMethod, state)
                .PipeTo(Self, success: () => Done.Instance, failure: ex => new PushFailed(pingId, ex));
        });
        Receive<Done>(_ => { });
        Receive<PushFailed>(f => _log.Warning(f.Cause, "signalr push failed for ping {0}", f.PingId));
    }

    private sealed record PushFailed(string PingId, Exception Cause);
}
