using Akka.Cluster.Tools.PublishSubscribe;
using Chess.Backend.Akka.Ping;
using Microsoft.AspNetCore.SignalR;
using Done = Akka.Done;

namespace Chess.Backend.WebApi.Hubs;

/// <summary>
/// One per node: subscribes to the cluster-wide `pings` topic and pushes every state to that ping's hub
/// group on THIS node. Subscribers connected to any node therefore see every actor, wherever it lives.
/// </summary>
internal sealed class HubFanOutActor : ReceiveActor
{
    public HubFanOutActor(IHubContext<PingsHub> hub, IActorRef mediator)
    {
        ArgumentNullException.ThrowIfNull(hub);
        ArgumentNullException.ThrowIfNull(mediator);

        mediator.Tell(new Subscribe(PingTopics.PubSub, Self));
        Receive<SubscribeAck>(_ => { });
        Receive<PingState>(state =>
            hub.Clients.Group(HubGroups.Ping(state.PingId)).SendAsync(PingsHub.StateMethod, state).PipeTo(Self, success: () => Done.Instance));
        Receive<Done>(_ => { });
    }
}
