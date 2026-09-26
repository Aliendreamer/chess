using Akka.Actor;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Live;
using Chess.Backend.WebApi.Live;
using Microsoft.AspNetCore.SignalR;

namespace Chess.Backend.Tests.Live;

public sealed class HubFanOutActorTests : TestKit
{
    private static (Mock<IHubContext<LiveHub>> Hub, Mock<IClientProxy> Group) Hub(string topic)
    {
        Mock<IClientProxy> group = new();
        Mock<IHubClients> clients = new();
        clients.Setup(c => c.Group(topic)).Returns(group.Object);
        Mock<IHubContext<LiveHub>> hub = new();
        hub.SetupGet(h => h.Clients).Returns(clients.Object);
        return (hub, group);
    }

    [Fact]
    public void Subscribes_to_the_live_topic_and_pushes_each_frame_to_its_topic_group()
    {
        TestProbe mediator = CreateTestProbe();
        (Mock<IHubContext<LiveHub>> hub, Mock<IClientProxy> group) = Hub("ping:p1");

        IActorRef actor = Sys.ActorOf(Props.Create(() => new HubFanOutActor(hub.Object, mediator.Ref)));

        Subscribe sub = mediator.ExpectMsg<Subscribe>();
        Assert.Equal(LiveTopics.PubSub, sub.Topic);

        // SubscribeAck must be a tolerated no-op, not a crash: send it, then prove the actor still pushes.
        actor.Tell(new SubscribeAck(sub));

        LiveFrame frame = new("ping:p1", 1, new { any = "payload" });
        actor.Tell(frame);
        AwaitAssert(() => group.Verify(g => g.SendCoreAsync("frame", It.Is<object?[]>(a => a.Length == 1 && ReferenceEquals(a[0], frame)), It.IsAny<CancellationToken>()), Times.Once));
    }

    [Fact]
    public void Faulted_push_is_logged_as_a_warning_and_does_not_crash_the_actor()
    {
        TestProbe mediator = CreateTestProbe();
        (Mock<IHubContext<LiveHub>> hub, Mock<IClientProxy> group) = Hub("ping:p1");
        group.Setup(g => g.SendCoreAsync("frame", It.IsAny<object?[]>(), It.IsAny<CancellationToken>()))
            .Returns(Task.FromException(new InvalidOperationException("boom")));

        IActorRef actor = Sys.ActorOf(Props.Create(() => new HubFanOutActor(hub.Object, mediator.Ref)));
        mediator.ExpectMsg<Subscribe>();

        LiveFrame frame = new("ping:p1", 1, "x");
        EventFilter.Warning(contains: "ping:p1").ExpectOne(() => actor.Tell(frame));

        // The actor survived the faulted push and still handles further frames.
        actor.Tell(frame with { Seq = 2 });
        AwaitAssert(() => group.Verify(g => g.SendCoreAsync("frame", It.IsAny<object?[]>(), It.IsAny<CancellationToken>()), Times.Exactly(2)));
    }
}
