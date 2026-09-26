using Akka.Actor;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Games;
using Chess.Backend.Live;

namespace Chess.Backend.Tests.Matchmaking;

public sealed class MatchmakingActorTests() : TestKit(AkkaConfig.InMemoryPersistenceWithTestScheduler)
{
    private const long A = 1;
    private const long B = 2;
    private const long C = 3;

    private FakeClock Clock { get; } = new(Time.Utc("2026-09-26T10:00:00Z"));

    /// <summary>Records every start and answers with a fresh game id.</summary>
    private sealed class FakeStarter : IGameStarter
    {
        public List<(long White, long Black, string Tc)> Started { get; } = [];

        public Task<GameView> StartAsync(long whiteId, long blackId, TimeControl timeControl, CancellationToken ct)
        {
            lock (Started)
            {
                Started.Add((whiteId, blackId, timeControl.ToString()));
            }

            Guid id = Guid.CreateVersion7();
            return Task.FromResult(new GameView(id, whiteId, blackId, timeControl.ToString(), GameStatus.Created, "fen", 0, "White", null, null, 0, 0, DateTimeOffset.UnixEpoch, null, null, null, 1));
        }
    }

    private FakeStarter Starter { get; } = new();

    /// <summary>A fixed seed makes colours deterministic per test; the colour test varies it.</summary>
    private IActorRef Matchmaker(IActorRef? mediator = null, int seed = 7) =>
        Sys.ActorOf(Props.Create(() => new MatchmakingActor(Starter, mediator, Clock, new Random(seed))));

    private object Join(IActorRef mm, long user, string tc)
    {
        mm.Tell(new JoinQueue(user, tc));
        return ExpectMsg<object>();
    }

    private void Advance(TimeSpan by)
    {
        Clock.Advance(by);
        ((TestScheduler)Sys.Scheduler).Advance(by);
    }

    [Fact]
    public void The_second_seeker_is_paired_with_the_first()
    {
        IActorRef mm = Matchmaker();

        Waiting waiting = Assert.IsType<Waiting>(Join(mm, A, "5+3"));
        Matched matched = Assert.IsType<Matched>(Join(mm, B, "5+3"));

        Assert.Equal(("5+3", 1, 1), (waiting.TimeControl, waiting.Position, waiting.WaitingCount));
        Assert.Equal("5+3", matched.TimeControl);
        Assert.Equal([A, B], new[] { matched.WhiteId, matched.BlackId }.Order());
        Assert.Equal((matched.WhiteId, matched.BlackId, "5+3"), Assert.Single(Starter.Started));
    }

    [Fact]
    public void A_queue_never_holds_two_seekers_because_pairing_is_immediate()
    {
        IActorRef mm = Matchmaker();
        Join(mm, A, "3+2");
        Assert.IsType<Matched>(Join(mm, B, "3+2"));

        Assert.Equal(0, Assert.IsType<QueueView>(Ask(mm, new GetQueue("3+2"))).WaitingCount);
        Assert.IsType<Waiting>(Join(mm, C, "3+2")); // the next seeker starts a new wait
    }

    [Fact]
    public void Re_joining_renews_and_keeps_the_place_and_never_pairs_with_yourself()
    {
        IActorRef mm = Matchmaker();
        Join(mm, A, "5+3");

        Waiting again = Assert.IsType<Waiting>(Join(mm, A, "5+3")); // A's own heartbeat

        Assert.Equal((1, 1), (again.Position, again.WaitingCount));
        Assert.Empty(Starter.Started);
    }

    [Fact]
    public void Joining_another_time_control_moves_you()
    {
        IActorRef mm = Matchmaker();
        Join(mm, A, "5+3");

        Assert.IsType<Waiting>(Join(mm, A, "10+5"));
        Assert.IsType<Waiting>(Join(mm, B, "5+3")); // A left 5+3

        Assert.IsType<Matched>(Join(mm, C, "10+5"));
    }

    [Fact]
    public void An_entry_not_renewed_for_60_seconds_expires()
    {
        IActorRef mm = Matchmaker();
        Join(mm, A, "5+3");

        Advance(TimeSpan.FromSeconds(61));

        Assert.IsType<Waiting>(Join(mm, B, "5+3"));
        Assert.Empty(Starter.Started);
    }

    [Fact]
    public void A_renewed_entry_does_not_expire()
    {
        IActorRef mm = Matchmaker();
        Join(mm, A, "5+3");
        Advance(TimeSpan.FromSeconds(40));
        Join(mm, A, "5+3");
        Advance(TimeSpan.FromSeconds(40));

        Assert.IsType<Matched>(Join(mm, B, "5+3"));
    }

    [Fact]
    public void Leaving_removes_the_entry()
    {
        IActorRef mm = Matchmaker();
        Join(mm, A, "5+3");

        mm.Tell(new LeaveQueue(A, "5+3"));
        ExpectMsg<Left>();

        Assert.IsType<Waiting>(Join(mm, B, "5+3"));
    }

    [Fact]
    public void A_heartbeat_just_after_being_paired_answers_with_the_same_game()
    {
        IActorRef mm = Matchmaker();
        Join(mm, A, "5+3");
        Matched matched = Assert.IsType<Matched>(Join(mm, B, "5+3"));

        Matched again = Assert.IsType<Matched>(Join(mm, A, "5+3")); // A's heartbeat raced the pairing

        Assert.Equal(matched.GameId, again.GameId);
        Assert.Single(Starter.Started);
    }

    [Fact]
    public void A_time_control_that_is_not_a_preset_is_refused() =>
        Assert.IsType<QueueRejected>(Join(Matchmaker(), A, "4+2"));

    [Fact]
    public void Colours_come_from_the_random_source()
    {
        (long White, long Black)[] pairings = [.. new[] { 1, 2, 3, 4 }.Select(seed =>
        {
            IActorRef mm = Matchmaker(seed: seed);
            Join(mm, A, "5+3");
            Matched m = Assert.IsType<Matched>(Join(mm, B, "5+3"));
            return (m.WhiteId, m.BlackId);
        })];

        // Each is a proper pairing of A and B, and across these seeds both colour outcomes occur: the joiner is not
        // always White (or always Black), so colours really come from the random source.
        Assert.All(pairings, p => Assert.Equal([A, B], new[] { p.White, p.Black }.Order()));
        Assert.Equal(2, pairings.Select(p => p.White).Distinct().Count());
    }

    [Fact]
    public void Every_change_publishes_the_queue_with_the_waiting_count_and_the_pairing()
    {
        TestProbe mediator = CreateTestProbe();
        IActorRef mm = Matchmaker(mediator.Ref);

        Join(mm, A, "5+3");
        QueueView afterJoin = Frame(mediator);
        Matched matched = Assert.IsType<Matched>(Join(mm, B, "5+3"));
        QueueView afterMatch = Frame(mediator);

        Assert.Equal(("5+3", 1), (afterJoin.TimeControl, afterJoin.WaitingCount));
        Assert.Null(afterJoin.LastPairing);
        Assert.Equal((0, matched.GameId, matched.WhiteId, matched.BlackId), (afterMatch.WaitingCount, afterMatch.LastPairing!.GameId, afterMatch.LastPairing.WhiteId, afterMatch.LastPairing.BlackId));
        Assert.True(afterMatch.Seq > afterJoin.Seq);
    }

    private static QueueView Frame(TestProbe mediator)
    {
        Publish p = mediator.ExpectMsg<Publish>();
        Assert.Equal(LiveTopics.PubSub, p.Topic);
        LiveFrame f = Assert.IsType<LiveFrame>(p.Message);
        Assert.StartsWith("queue:", f.Topic, StringComparison.Ordinal);
        return Assert.IsType<QueueView>(f.Payload);
    }

    private object Ask(IActorRef mm, object message)
    {
        mm.Tell(message);
        return ExpectMsg<object>();
    }
}
