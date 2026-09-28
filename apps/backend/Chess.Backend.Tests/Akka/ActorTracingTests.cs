using System.Collections.Concurrent;
using System.Diagnostics;
using Akka.Actor;
using Akka.Persistence;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Akka.Ping;
using Chess.Backend.Events;
using Chess.Backend.Games;
using Chess.Backend.Messaging;

namespace Chess.Backend.Tests.Akka;

/// <summary>
/// A trace crosses an actor (observability D3, D4): the sender wraps the command, the actor handles it in a span of
/// that trace, and the event it persists carries the span. Spans are recorded by a listener, as the exporter would.
/// </summary>
public sealed class ActorTracingTests : TestKit
{
    private const string Parent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

    private static readonly ActivitySource Test = new("chess.tests.tracing");

    private readonly ConcurrentQueue<Activity> _stopped = new();
    private readonly ActivityListener _listener;
    private readonly FakeClock _clock = new(Time.Utc("2026-09-28T10:00:00Z"));

    public ActorTracingTests()
        : base(AkkaConfig.InMemoryPersistence)
    {
        _listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name is ActorTracing.SourceName or "chess.tests.tracing",
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = _stopped.Enqueue,
        };
        ActivitySource.AddActivityListener(_listener);
        Activity.Current = null;
    }

    protected override void Dispose(bool disposing)
    {
        _listener.Dispose();
        base.Dispose(disposing);
    }

    private static TimeControl Blitz => TimeControl.Presets.Single(tc => tc.ToString() == "5+3");

    private Activity SpanFor(string name, Guid gameId)
    {
        Activity? span = null;
        AwaitCondition(() => (span = _stopped.FirstOrDefault(a =>
            a.OperationName == name && Equals(a.GetTagItem("game.id"), gameId.ToString("N")))) is not null);
        return span!;
    }

    private List<object> Journal(Guid gameId)
    {
        IActorRef journal = Persistence.Instance.Apply(Sys).JournalFor(null);
        journal.Tell(new ReplayMessages(1, long.MaxValue, long.MaxValue, GameActor.PersistenceIdPrefix + gameId.ToString("N"), TestActor));
        List<object> events = [];
        while (ExpectMsg<object>() is ReplayedMessage replayed)
        {
            events.Add(replayed.Persistent.Payload);
        }

        return events;
    }

    [Fact]
    public void Without_a_trace_a_message_travels_bare()
    {
        GetGameView message = new(Guid.CreateVersion7());

        Assert.Same(message, ActorTracing.Wrap(message));
        Assert.Same(message, ActorTracing.Unwrap(message));
    }

    [Fact]
    public void With_a_trace_the_message_carries_it_once()
    {
        using Activity request = Test.StartActivity("POST /api/games/{id}/moves")!;
        GetGameView message = new(Guid.CreateVersion7());

        Traced traced = Assert.IsType<Traced>(ActorTracing.Wrap(message));

        Assert.Equal(request.Id, traced.TraceParent);
        Assert.Same(message, ActorTracing.Unwrap(traced));
        Assert.Same(traced, ActorTracing.Wrap(traced));
    }

    [Fact]
    public void The_shard_extractors_find_the_entity_inside_the_envelope()
    {
        Guid id = Guid.CreateVersion7();
        GameMessageExtractor games = new(50);
        InviteMessageExtractor invites = new(50);
        PingMessageExtractor pings = new(50);

        Assert.Equal(id.ToString("N"), games.EntityId(new Traced(new MakeMove(id, 11, "e2e4"), Parent)));
        Assert.Equal(id.ToString("N"), invites.EntityId(new Traced(new GetInvite(id), Parent)));
        Assert.Equal("p1", pings.EntityId(new Traced(new GetPingState("p1"), Parent)));
    }

    [Fact]
    public void A_traced_move_is_handled_in_a_span_of_that_trace_and_its_event_carries_the_span()
    {
        Guid id = Guid.CreateVersion7();
        IActorRef game = Sys.ActorOf(Props.Create(() => new GameActor(id, null, _clock)));
        Activity request = Test.StartActivity("POST /api/games/{id}/moves")!;
        game.Tell(ActorTracing.Wrap(new CreateGame(id, 11, 22, Blitz)), TestActor);
        ExpectMsg<GameView>();
        game.Tell(ActorTracing.Wrap(new MakeMove(id, 11, "e2e4")), TestActor);
        ExpectMsg<GameView>();
        request.Stop();

        Activity span = SpanFor("game MakeMove", id);

        Assert.Equal(request.TraceId, span.TraceId);
        Assert.Equal(request.SpanId, span.ParentSpanId);
        Assert.Equal(ActivityKind.Consumer, span.Kind);
        MoveMade move = Assert.Single(Journal(id).OfType<MoveMade>());
        Assert.Equal(span.Id, move.Trace);
    }

    [Fact]
    public void An_untraced_command_makes_no_span_and_its_event_no_trace()
    {
        Guid id = Guid.CreateVersion7();
        IActorRef game = Sys.ActorOf(Props.Create(() => new GameActor(id, null, _clock)));

        game.Tell(new CreateGame(id, 11, 22, Blitz), TestActor);
        ExpectMsg<GameView>();

        Assert.Null(Assert.Single(Journal(id).OfType<GameCreated>()).Trace);
        Assert.DoesNotContain(_stopped, a => Equals(a.GetTagItem("game.id"), id.ToString("N")));
    }

    [Fact]
    public void A_timer_starts_a_trace_of_its_own_and_nothing_leaks_from_the_thread()
    {
        using Activity stale = Test.StartActivity("whatever ran on this thread before")!;
        Activity? inTimer = null;
        Activity? inUntraced = new("placeholder");

        ActorTracing.Receive("game", "FlagCheck", _ => (inTimer = Activity.Current) is not null, startsTrace: _ => true);
        ActorTracing.Receive("game", "Unrelated", _ => (inUntraced = Activity.Current) is null);

        Assert.NotNull(inTimer);
        Assert.NotEqual(stale.TraceId, inTimer.TraceId);
        Assert.Equal(default, inTimer.ParentSpanId);
        Assert.Null(inUntraced);
        Assert.Same(stale, Activity.Current);
    }

    [Fact]
    public void The_live_frame_of_a_traced_move_carries_the_moves_trace()
    {
        Guid id = Guid.CreateVersion7();
        TestProbe mediator = CreateTestProbe();
        IActorRef game = Sys.ActorOf(Props.Create(() => new GameActor(id, mediator.Ref, _clock)));
        using Activity request = Test.StartActivity("POST /api/games/{id}/moves")!;
        game.Tell(ActorTracing.Wrap(new CreateGame(id, 11, 22, Blitz)), TestActor);
        ExpectMsg<GameView>();
        game.Tell(ActorTracing.Wrap(new MakeMove(id, 11, "e2e4")), TestActor);
        ExpectMsg<GameView>();

        LiveFrame frame = (LiveFrame)mediator.FishForMessage<global::Akka.Cluster.Tools.PublishSubscribe.Publish>(
            p => p.Message is LiveFrame { Seq: 2 }).Message;

        Assert.Equal(Assert.Single(Journal(id).OfType<MoveMade>()).Trace, frame.Trace);
        Assert.NotNull(frame.Trace);
    }
}
