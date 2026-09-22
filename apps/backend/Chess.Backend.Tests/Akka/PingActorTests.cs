using Akka.Actor;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Ping;
using Chess.Backend.Events;
using Chess.Backend.Messaging;

namespace Chess.Backend.Tests.Akka;

public sealed class PingActorTests : TestKit
{
    private sealed class CapturingPublisher : IEventPublisher
    {
        public List<(string Topic, string Key, string Json)> Published { get; } = [];

        public Task PublishAsync(string topic, string key, string json, CancellationToken ct)
        {
            Published.Add((topic, key, json));
            return Task.CompletedTask;
        }
    }

    public PingActorTests() : base("akka.persistence.journal.plugin = \"akka.persistence.journal.inmem\"\nakka.persistence.snapshot-store.plugin = \"akka.persistence.snapshot-store.inmem\"") { }

    private IActorRef Create(string id, CapturingPublisher publisher, IActorRef? mediator = null) =>
        Sys.ActorOf(Props.Create(() => new PingActor(id, publisher, mediator)), $"ping-{id}-{Guid.NewGuid():N}");

    [Fact]
    public void Fresh_actor_has_empty_state()
    {
        IActorRef actor = Create("p1", new CapturingPublisher());
        actor.Tell(new GetPingState("p1"));
        PingState s = ExpectMsg<PingState>();
        Assert.Equal(0, s.Count);
        Assert.Null(s.LastText);
    }

    [Fact]
    public void Ping_updates_state_and_publishes_envelope()
    {
        CapturingPublisher publisher = new();
        IActorRef actor = Create("p1", publisher);

        actor.Tell(new Ping("p1", "hello", 42));
        PingState s = ExpectMsg<PingState>();

        Assert.Equal(1, s.Count);
        Assert.Equal("hello", s.LastText);
        Assert.Equal(1, s.LastSeq);
        (string topic, string key, string json) = Assert.Single(publisher.Published);
        Assert.Equal(PingTopics.Kafka, topic);
        Assert.Equal("ping:p1", key);
        Assert.True(EventJson.TryDeserialize(json, out EventEnvelope<Pinged>? e));
        Assert.Equal("hello", e.Payload.Text);
        Assert.Equal(42, e.Payload.UserId);
        Assert.Equal(1, e.Seq);
    }

    [Fact]
    public void Ping_publishes_to_pubsub_mediator()
    {
        TestProbe mediator = CreateTestProbe();
        IActorRef actor = Create("p1", new CapturingPublisher(), mediator.Ref);
        actor.Tell(new Ping("p1", "hello", 42));
        ExpectMsg<PingState>();
        Publish published = mediator.ExpectMsg<Publish>();
        Assert.Equal(PingTopics.PubSub, published.Topic);
        Assert.IsType<PingState>(published.Message);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Rejects_empty_text(string text)
    {
        CapturingPublisher publisher = new();
        IActorRef actor = Create("p1", publisher);
        actor.Tell(new Ping("p1", text, 42));
        ExpectMsg<PingRejected>();
        Assert.Empty(publisher.Published);
    }

    [Fact]
    public void Rejects_text_over_200_chars()
    {
        IActorRef actor = Create("p1", new CapturingPublisher());
        actor.Tell(new Ping("p1", new string('x', 201), 42));
        ExpectMsg<PingRejected>();
    }

    [Fact]
    public void State_survives_actor_restart_via_journal()
    {
        CapturingPublisher publisher = new();
        IActorRef first = Create("p2", publisher);
        first.Tell(new Ping("p2", "one", 1));
        ExpectMsg<PingState>();
        first.Tell(new Ping("p2", "two", 1));
        ExpectMsg<PingState>();
        Watch(first);
        Sys.Stop(first);
        ExpectTerminated(first);

        IActorRef second = Create("p2", publisher);
        second.Tell(new GetPingState("p2"));
        PingState s = ExpectMsg<PingState>();
        Assert.Equal(2, s.Count);
        Assert.Equal("two", s.LastText);
        Assert.Equal(2, publisher.Published.Count); // recovery does NOT republish
    }

    [Fact]
    public void Snapshots_after_twenty_events()
    {
        IActorRef actor = Create("p3", new CapturingPublisher());
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
        IActorRef again = Create("p3", new CapturingPublisher());
        again.Tell(new GetPingState("p3"));
        Assert.Equal(PingActor.SnapshotEvery, ExpectMsg<PingState>().Count);
    }
}
