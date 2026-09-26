using Akka.Actor;
using Akka.Cluster.Sharding;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;

namespace Chess.Backend.Tests.Games;

/// <summary>
/// Clocks, flag fall, abort, failover forgiveness and passivation under virtual time: <see cref="FakeClock"/> is what
/// the actor reads as "now", Akka's <see cref="TestScheduler"/> is what fires its timers, and <see cref="Advance"/>
/// moves both together.
/// </summary>
public sealed class GameClockTests : TestKit
{
    private const long White = 11;
    private const long Black = 22;
    private static readonly DateTimeOffset T0 = DateTimeOffset.Parse("2026-09-26T10:00:00Z", System.Globalization.CultureInfo.InvariantCulture);

    public GameClockTests()
        : base("""
               akka.persistence.journal.plugin = "akka.persistence.journal.inmem"
               akka.persistence.snapshot-store.plugin = "akka.persistence.snapshot-store.inmem"
               akka.scheduler.implementation = "Akka.TestKit.TestScheduler, Akka.TestKit"
               """)
    {
    }

    private FakeClock Clock { get; } = new(T0);

    private TestScheduler Scheduler => (TestScheduler)Sys.Scheduler;

    private static TimeControl Tc(string text) => TimeControl.Presets.Single(tc => tc.ToString() == text);

    private void Advance(TimeSpan by)
    {
        Clock.Advance(by);
        Scheduler.Advance(by);
    }

    private Props GameProps(Guid id) => Props.Create(() => new GameActor(id, null, Clock));

    private (Guid Id, IActorRef Actor, TestProbe Parent) Started(string tc)
    {
        Guid id = Guid.CreateVersion7();
        TestProbe parent = CreateTestProbe();
        IActorRef actor = parent.ChildActorOf(GameProps(id));
        actor.Tell(new CreateGame(id, White, Black, Tc(tc)), TestActor);
        ExpectMsg<GameView>();
        return (id, actor, parent);
    }

    private object Send(IActorRef actor, object command)
    {
        actor.Tell(command, TestActor);
        return ExpectMsg<object>();
    }

    private GameView Move(IActorRef actor, Guid id, long user, string uci) =>
        Assert.IsType<GameView>(Send(actor, new MakeMove(id, user, uci)));

    private GameView View(IActorRef actor, Guid id) => Assert.IsType<GameView>(Send(actor, new GetGameView(id)));

    /// <summary>Both first moves: from here White's clock runs.</summary>
    private void Opened(IActorRef actor, Guid id)
    {
        Move(actor, id, White, "e2e4");
        Move(actor, id, Black, "e7e5");
    }

    [Fact]
    public void No_clock_runs_before_each_sides_first_move()
    {
        (Guid id, IActorRef actor, _) = Started("5+3");

        Advance(TimeSpan.FromSeconds(20));
        GameView afterWhite = Move(actor, id, White, "e2e4");
        Advance(TimeSpan.FromSeconds(30));
        GameView afterBlack = Move(actor, id, Black, "e7e5");

        Assert.Equal((300_000L, 300_000L), (afterWhite.WhiteMs, afterWhite.BlackMs));
        Assert.Equal((300_000L, 300_000L), (afterBlack.WhiteMs, afterBlack.BlackMs));
    }

    [Fact]
    public void A_move_costs_the_elapsed_time_and_earns_the_increment()
    {
        (Guid id, IActorRef actor, _) = Started("3+2");
        Opened(actor, id);

        Advance(TimeSpan.FromSeconds(4));
        GameView moved = Move(actor, id, White, "g1f3");

        Assert.Equal(178_000, moved.WhiteMs); // 180 000 − 4 000 + 2 000, the spec's example
        Assert.Equal(180_000, moved.BlackMs);
    }

    [Fact]
    public void The_side_to_moves_clock_counts_down_in_the_view()
    {
        (Guid id, IActorRef actor, _) = Started("3+2");
        Opened(actor, id);

        Advance(TimeSpan.FromSeconds(7));

        GameView view = View(actor, id);
        Assert.Equal((173_000L, Clock.Now), (view.WhiteMs, view.ClockAt));
    }

    [Fact]
    public void The_flag_falls_on_time_with_no_message_sent()
    {
        (Guid id, IActorRef actor, _) = Started("1+0");
        Opened(actor, id);

        Advance(TimeSpan.FromSeconds(60));

        GameView ended = View(actor, id);
        Assert.Equal((GameStatus.Ended, "0-1", "Timeout", 0L), (ended.Status, ended.Result, ended.Reason, ended.WhiteMs));
    }

    [Fact]
    public void A_move_that_arrives_after_the_flag_fell_ends_the_game_instead()
    {
        (Guid id, IActorRef actor, _) = Started("1+0");
        Opened(actor, id);

        Clock.Advance(TimeSpan.FromSeconds(61)); // the timer hasn't fired yet (scheduler not advanced)
        GameView reply = Move(actor, id, White, "g1f3");

        Assert.Equal((GameStatus.Ended, "Timeout", 2), (reply.Status, reply.Reason, reply.Ply));
    }

    [Fact]
    public void A_stale_flag_timer_does_not_end_the_game()
    {
        (Guid id, IActorRef actor, _) = Started("1+0");
        Opened(actor, id);
        Advance(TimeSpan.FromSeconds(30));

        actor.Tell(GameActor.FlagCheck.Instance); // as if an old timer fired early

        Assert.Equal(GameStatus.Playing, View(actor, id).Status);
    }

    [Fact]
    public void An_unplayed_game_is_aborted_after_one_minute()
    {
        (Guid id, IActorRef actor, _) = Started("5+3");

        Advance(TimeSpan.FromSeconds(61));

        GameView aborted = View(actor, id);
        Assert.Equal((GameStatus.Ended, "*", "Aborted"), (aborted.Status, aborted.Result, aborted.Reason));
    }

    [Fact]
    public void Blacks_first_reply_has_its_own_minute()
    {
        (Guid id, IActorRef actor, _) = Started("5+3");
        Advance(TimeSpan.FromSeconds(50));
        Move(actor, id, White, "e2e4");

        Advance(TimeSpan.FromSeconds(50)); // 100 s since the start, 50 s since White's move
        Assert.Equal(GameStatus.Playing, View(actor, id).Status);

        Advance(TimeSpan.FromSeconds(11));
        Assert.Equal("Aborted", View(actor, id).Reason);
    }

    [Fact]
    public void Abort_is_allowed_before_your_own_first_move_only()
    {
        (Guid id, IActorRef actor, _) = Started("5+3");
        Move(actor, id, White, "e2e4");

        Assert.Equal(RejectionCode.Conflict, Assert.IsType<GameRejected>(Send(actor, new AbortGame(id, White))).Code);
        GameView aborted = Assert.IsType<GameView>(Send(actor, new AbortGame(id, Black)));
        Assert.Equal(("*", "Aborted"), (aborted.Result, aborted.Reason));

        (Guid id2, IActorRef actor2, _) = Started("5+3");
        Opened(actor2, id2);
        Assert.Equal(RejectionCode.Conflict, Assert.IsType<GameRejected>(Send(actor2, new AbortGame(id2, Black))).Code);
    }

    [Fact]
    public void Recovery_gives_the_side_to_move_its_clock_back_and_rearms_the_flag()
    {
        (Guid id, IActorRef actor, _) = Started("1+0");
        Opened(actor, id);
        Advance(TimeSpan.FromSeconds(10));
        GameView atLastEvent = Move(actor, id, White, "g1f3"); // White 50 s, Black's turn with 60 s
        Assert.Equal(60_000, atLastEvent.BlackMs);

        Advance(TimeSpan.FromSeconds(3)); // Black thinks 3 s, then the node dies
        Watch(actor);
        Sys.Stop(actor);
        ExpectTerminated(actor);
        Advance(TimeSpan.FromSeconds(2)); // 2 s of outage

        IActorRef recovered = Sys.ActorOf(GameProps(id));
        GameView view = View(recovered, id); // a read alone must re-arm the timer (wake-on-subscribe)
        Assert.Equal((60_000L, 50_000L), (view.BlackMs, view.WhiteMs));

        Advance(TimeSpan.FromSeconds(59));
        Assert.Equal(GameStatus.Playing, View(recovered, id).Status);
        Advance(TimeSpan.FromSeconds(2));
        Assert.Equal(("1-0", "Timeout"), (View(recovered, id).Result, View(recovered, id).Reason));
    }

    [Fact]
    public void An_ended_game_passivates_itself_after_a_minute_and_a_live_one_never_does()
    {
        (Guid id, IActorRef actor, TestProbe parent) = Started("90+30");
        Opened(actor, id);
        Advance(TimeSpan.FromMinutes(10)); // a long think in a classical game
        parent.ExpectNoMsg(TimeSpan.FromMilliseconds(100));

        Send(actor, new Resign(id, White));
        Advance(TimeSpan.FromSeconds(61));

        parent.ExpectMsg<Passivate>();
    }

    [Theory]
    [InlineData("8/8/8/8/8/5k2/8/K5N1 w - - 0 1", "Black", "1/2-1/2", "TimeoutVsInsufficientMaterial")] // Black flags; White has K+N only
    [InlineData("8/8/8/8/8/5k2/8/K5R1 w - - 0 1", "Black", "1-0", "Timeout")] // Black flags; White has a rook
    [InlineData("8/8/8/8/8/5k2/8/K7 w - - 0 1", "White", "1/2-1/2", "TimeoutVsInsufficientMaterial")] // White flags; Black has a lone king
    [InlineData("8/8/8/8/8/5k2/p7/K7 w - - 0 1", "White", "0-1", "Timeout")] // White flags; Black has a pawn
    public void Timeout_result_depends_on_the_opponents_mating_material(string fen, string flagged, string result, string reason)
    {
        GameOutcome outcome = GameActor.TimeoutOutcome(ChessRules.FromFen(fen), Enum.Parse<Side>(flagged));

        Assert.Equal((result, reason), (outcome.Result.ToPgn(), outcome.Reason.ToString()));
    }
}
