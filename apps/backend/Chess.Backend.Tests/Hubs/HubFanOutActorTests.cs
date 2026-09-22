using Akka.Actor;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Ping;
using Chess.Backend.WebApi.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace Chess.Backend.Tests.Hubs;

public sealed class HubFanOutActorTests : TestKit
{
    [Fact]
    public void Subscribes_on_start_and_pushes_state_to_the_ping_group()
    {
        TestProbe mediator = CreateTestProbe();
        Mock<IClientProxy> group = new();
        Mock<IHubClients> clients = new();
        clients.Setup(c => c.Group("ping:p1")).Returns(group.Object);
        Mock<IHubContext<PingsHub>> hub = new();
        hub.SetupGet(h => h.Clients).Returns(clients.Object);

        IActorRef actor = Sys.ActorOf(Props.Create(() => new HubFanOutActor(hub.Object, mediator.Ref)));

        Subscribe sub = mediator.ExpectMsg<Subscribe>();
        Assert.Equal(PingTopics.PubSub, sub.Topic);

        // SubscribeAck must be a tolerated no-op, not a crash: send it, then prove the actor still pushes.
        actor.Tell(new SubscribeAck(sub));

        PingState state = new("p1", 1, "hi", DateTimeOffset.UtcNow, 1);
        actor.Tell(state);
        AwaitAssert(() => group.Verify(g => g.SendCoreAsync("state", It.Is<object?[]>(a => a.Length == 1 && (PingState)a[0]! == state), It.IsAny<CancellationToken>()), Times.Once));
    }

    [Fact]
    public void Faulted_push_is_logged_as_a_warning_and_does_not_crash_the_actor()
    {
        TestProbe mediator = CreateTestProbe();
        Mock<IClientProxy> group = new();
        group.Setup(g => g.SendCoreAsync("state", It.IsAny<object?[]>(), It.IsAny<CancellationToken>()))
            .Returns(Task.FromException(new InvalidOperationException("boom")));
        Mock<IHubClients> clients = new();
        clients.Setup(c => c.Group("ping:p1")).Returns(group.Object);
        Mock<IHubContext<PingsHub>> hub = new();
        hub.SetupGet(h => h.Clients).Returns(clients.Object);

        IActorRef actor = Sys.ActorOf(Props.Create(() => new HubFanOutActor(hub.Object, mediator.Ref)));
        mediator.ExpectMsg<Subscribe>();

        PingState state = new("p1", 1, "hi", DateTimeOffset.UtcNow, 1);
        EventFilter.Warning(contains: "p1").ExpectOne(() => actor.Tell(state));

        // The actor survived the faulted push and still handles further PingState messages.
        PingState nextState = state with { Count = 2, LastSeq = 2 };
        actor.Tell(nextState);
        AwaitAssert(() => group.Verify(g => g.SendCoreAsync("state", It.IsAny<object?[]>(), It.IsAny<CancellationToken>()), Times.Exactly(2)));
    }
}
