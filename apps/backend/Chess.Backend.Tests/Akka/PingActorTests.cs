using Akka.Actor;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Ping;

namespace Chess.Backend.Tests.Akka;

public sealed class PingActorTests : TestKit
{
    public PingActorTests() : base("akka.persistence.journal.plugin = \"akka.persistence.journal.inmem\"\nakka.persistence.snapshot-store.plugin = \"akka.persistence.snapshot-store.inmem\"") { }

    private IActorRef Create(string id, IActorRef? mediator = null) =>
        Sys.ActorOf(Props.Create(() => new PingActor(id, mediator)), $"ping-{id}-{Guid.NewGuid():N}");

    [Fact]
    public void Fresh_actor_has_empty_state()
    {
        IActorRef actor = Create("p1");
        actor.Tell(new GetPingState("p1"));
        PingState s = ExpectMsg<PingState>();
        Assert.Equal(0, s.Count);
        Assert.Null(s.LastText);
    }

    [Fact]
    public void Ping_updates_state()
    {
        IActorRef actor = Create("p1");

        actor.Tell(new Ping("p1", "hello", 42));
        PingState s = ExpectMsg<PingState>();

        // Kafka is fed from the journal by JournalPublisher now; the actor only persists and replies.
        Assert.Equal(1, s.Count);
        Assert.Equal("hello", s.LastText);
        Assert.Equal(1, s.LastSeq);
    }

    [Fact]
    public void Ping_publishes_a_live_frame_to_the_live_topic()
    {
        TestProbe mediator = CreateTestProbe();
        IActorRef actor = Create("p1", mediator.Ref);
        actor.Tell(new Ping("p1", "hello", 42));
        PingState state = ExpectMsg<PingState>();
        Publish published = mediator.ExpectMsg<Publish>();
        Assert.Equal(Chess.Backend.Live.LiveTopics.PubSub, published.Topic);
        Chess.Backend.Live.LiveFrame frame = Assert.IsType<Chess.Backend.Live.LiveFrame>(published.Message);
        Assert.Equal(("ping:p1", 1L), (frame.Topic, frame.Seq));
        Assert.Equal(state, frame.Payload);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Rejects_empty_text(string text)
    {
        IActorRef actor = Create("p1");
        actor.Tell(new Ping("p1", text, 42));
        ExpectMsg<PingRejected>();
    }

    [Fact]
    public void Rejects_text_over_200_chars()
    {
        IActorRef actor = Create("p1");
        actor.Tell(new Ping("p1", new string('x', 201), 42));
        ExpectMsg<PingRejected>();
    }

    [Fact]
    public void State_survives_actor_restart_via_journal()
    {
        IActorRef first = Create("p2");
        first.Tell(new Ping("p2", "one", 1));
        ExpectMsg<PingState>();
        first.Tell(new Ping("p2", "two", 1));
        ExpectMsg<PingState>();
        Watch(first);
        Sys.Stop(first);
        ExpectTerminated(first);

        IActorRef second = Create("p2");
        second.Tell(new GetPingState("p2"));
        PingState s = ExpectMsg<PingState>();
        Assert.Equal(2, s.Count);
        Assert.Equal("two", s.LastText);
    }

    [Fact]
    public void Snapshots_after_twenty_events()
    {
        IActorRef actor = Create("p3");
        for (int i = 0; i < PingActor.SnapshotEvery; i++)
        {
            actor.Tell(new Ping("p3", $"n{i}", 1));
            ExpectMsg<PingState>();
        }

        actor.Tell(new GetPingState("p3"));
        Assert.Equal(PingActor.SnapshotEvery, ExpectMsg<PingState>().Count);
        // Recovery from snapshot: a new incarnation must show the same count without replaying 20 events.
        Watch(actor);
        Sys.Stop(actor);
        ExpectTerminated(actor);
        IActorRef again = Create("p3");
        again.Tell(new GetPingState("p3"));
        Assert.Equal(PingActor.SnapshotEvery, ExpectMsg<PingState>().Count);
    }
}
