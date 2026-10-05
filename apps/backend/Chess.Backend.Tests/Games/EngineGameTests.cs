using Akka.Actor;
using Akka.TestKit;
using Chess.Backend.Akka.Games;
using Chess.Backend.Events;
using Chess.Backend.Games;
using Chess.Backend.Tests.Engine;

namespace Chess.Backend.Tests.Games;

/// <summary>Games against the engine (engine-play D2–D5): the engine's seat, no draw offers, abandonment by the human only, recovery.</summary>
public sealed class EngineGameTests() : GameActorTestBase(virtualTime: true)
{
    private static readonly EngineLevel Level = EngineLevel.Find("1600")!;
    private static readonly EnginePlayer AsBlack = new("black", "1600");

    /// <summary>The Breyer Ruy Lopez to move 11: 22 plies, past a snapshot (every 20 events).</summary>
    private const string LongLine = "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8 h2h3 c6b8 d2d4 b8d7 c3c4 c7c6";

    private RecordingEngineRequests Requests { get; } = new();

    /// <summary>Timings for tests about the engine's stall: the person stays presumed present throughout.</summary>
    private static readonly GameTimings LongLease = GameTimings.Default with { Lease = TimeSpan.FromHours(1) };

    private (Guid Id, IActorRef Actor) EngineGame(GameTimings? timings = null)
    {
        Guid id = Guid.CreateVersion7();
        IActorRef actor = CreateTestProbe().ChildActorOf(Props.Create(() => new GameActor(id, null, Clock, timings ?? GameTimings.Default, Requests)));
        GameView created = Assert.IsType<GameView>(Send(actor, new CreateGame(id, White, Level.UserId, TimeControl.Untimed, AsBlack)));
        Assert.Equal(("black", "1600"), (created.EngineSide, created.EngineLevel));
        return (id, actor);
    }

    /// <summary>Plays <paramref name="line"/> with the human as White and the engine's player as Black.</summary>
    private GameView Play(IActorRef actor, Guid id, string line)
    {
        GameView view = null!;
        string[] moves = line.Split(' ');
        for (int i = 0; i < moves.Length; i++)
        {
            view = Move(actor, id, i % 2 == 0 ? White : Level.UserId, moves[i]);
        }

        return view;
    }

    [Theory]
    [InlineData("black", "1600", White, -2L)]
    [InlineData("white", "max", -5L, Black)]
    public void The_engine_sits_on_its_side_as_its_levels_player(string side, string level, long whiteId, long blackId)
    {
        Guid id = Guid.CreateVersion7();
        object reply = Send(Spawn(id), new CreateGame(id, whiteId, blackId, TimeControl.Untimed, new EnginePlayer(side, level)));

        GameView view = Assert.IsType<GameView>(reply);
        Assert.Equal((side, level), (view.EngineSide, view.EngineLevel));
    }

    [Theory]
    [InlineData("black", "1800")] // no such level
    [InlineData("white", "1600")] // White is the human, not the engine's player
    [InlineData("left", "1600")]
    public void A_wrong_seat_is_refused_and_nothing_is_created(string side, string level)
    {
        Guid id = Guid.CreateVersion7();
        IActorRef actor = Spawn(id);

        AssertRejected(Send(actor, new CreateGame(id, White, Level.UserId, TimeControl.Untimed, new EnginePlayer(side, level))), RejectionCode.Conflict);
        AssertRejected(Send(actor, new GetGameView(id)), RejectionCode.NotFound);
    }

    [Fact]
    public void The_engines_player_moves_like_any_player()
    {
        (Guid id, IActorRef actor) = EngineGame();

        GameView view = Play(actor, id, "e2e4 c7c5");

        Assert.Equal((2, "c5"), (view.Ply, view.LastSan));
    }

    [Fact]
    public void Draw_offers_are_refused_and_persist_nothing()
    {
        (Guid id, IActorRef actor) = EngineGame();
        long seq = Play(actor, id, "e2e4 e7e5").Seq;

        AssertRejected(Send(actor, new OfferDraw(id, White)), RejectionCode.Conflict);

        Assert.Equal(seq, View(actor, id).Seq);
    }

    /// <summary>Reports presence and waits until the actor has handled it (reports have no reply of their own).</summary>
    private void Report(IActorRef actor, Guid id, long user, bool present)
    {
        actor.Tell(new ReportPresence(id, user, "bff-1", present), TestActor);
        View(actor, id);
    }

    /// <summary>A game with the engine as White, already past its first move, the human (Black) to reply.</summary>
    private (Guid Id, IActorRef Actor) EngineAsWhite(GameTimings? timings = null)
    {
        Guid id = Guid.CreateVersion7();
        IActorRef actor = CreateTestProbe().ChildActorOf(Props.Create(() => new GameActor(id, null, Clock, timings ?? GameTimings.Default, Requests)));
        Assert.IsType<GameView>(Send(actor, new CreateGame(id, Level.UserId, Black, TimeControl.Untimed, new EnginePlayer("white", "1600"))));
        Move(actor, id, Level.UserId, "e2e4");
        return (id, actor);
    }

    [Fact]
    public void A_human_away_for_a_minute_loses_to_the_engine_by_abandonment()
    {
        (Guid id, IActorRef actor) = EngineGame();
        Play(actor, id, "e2e4 e7e5");

        Report(actor, id, White, present: true);
        Report(actor, id, White, present: false);
        Advance(GameTimings.Default.AbandonAfter - TimeSpan.FromSeconds(1));
        Assert.Equal((GameStatus.Playing, (long?)White), (View(actor, id).Status, View(actor, id).AbsentId));
        Advance(TimeSpan.FromSeconds(2));

        AwaitAssert(() =>
        {
            GameView view = View(actor, id);
            Assert.Equal((GameStatus.Ended, "0-1", EndReason.Abandonment, (long?)null), (view.Status, view.Result, view.Reason, view.ClaimableBy));
        });
    }

    [Fact]
    public void The_human_as_black_loses_by_abandonment_after_their_first_move()
    {
        (Guid id, IActorRef actor) = EngineAsWhite(GameTimings.Default with { EngineStall = TimeSpan.FromHours(1) });
        Move(actor, id, Black, "e7e5");

        Report(actor, id, Black, present: false);
        Advance(GameTimings.Default.AbandonAfter + TimeSpan.FromSeconds(1));

        AwaitAssert(() => Assert.Equal(("1-0", EndReason.Abandonment), (View(actor, id).Result, View(actor, id).Reason)));
    }

    [Fact]
    public void Coming_back_within_the_minute_keeps_the_game_going_and_nobody_may_claim()
    {
        (Guid id, IActorRef actor) = EngineGame();
        Play(actor, id, "e2e4 e7e5");

        Report(actor, id, White, present: false);
        Advance(TimeSpan.FromSeconds(40));
        Report(actor, id, White, present: true);
        Advance(TimeSpan.FromMinutes(5));
        Report(actor, id, White, present: true);

        GameView view = View(actor, id);
        Assert.Equal((GameStatus.Playing, (long?)null, (long?)null), (view.Status, view.AbsentId, view.ClaimableBy));
        AssertRejected(Send(actor, new ClaimAbandonment(id, White, Win: true)), RejectionCode.Conflict);
        AssertRejected(Send(actor, new ClaimAbandonment(id, Level.UserId, Win: true)), RejectionCode.Conflict);
    }

    [Fact]
    public void Leaving_before_the_first_move_only_aborts_it()
    {
        (Guid id, IActorRef actor) = EngineAsWhite();

        Report(actor, id, Black, present: false);
        Advance(GameActor.FirstMoveWindow + TimeSpan.FromSeconds(1));

        AwaitAssert(() => Assert.Equal(("*", EndReason.Aborted), (View(actor, id).Result, View(actor, id).Reason)));
    }

    [Fact]
    public void A_recovered_game_nobody_reports_on_ends_after_one_lease_and_a_minute()
    {
        (Guid id, IActorRef actor) = EngineGame();
        Play(actor, id, "e2e4 e7e5");
        StopAndWait(actor);

        IActorRef recovered = Spawn(id);
        Assert.Equal(GameStatus.Playing, View(recovered, id).Status);
        Advance(GameTimings.Default.Lease + TimeSpan.FromSeconds(1));
        AwaitAssert(() => Assert.Equal((long?)White, View(recovered, id).AbsentId));
        Advance(GameTimings.Default.AbandonAfter + TimeSpan.FromSeconds(1));

        AwaitAssert(() => Assert.Equal(("0-1", EndReason.Abandonment), (View(recovered, id).Result, View(recovered, id).Reason)));
    }

    [Fact]
    public void The_engines_seat_survives_recovery_from_a_snapshot()
    {
        (Guid id, IActorRef actor) = EngineGame();
        GameView before = Play(actor, id, LongLine);

        Watch(actor);
        actor.Tell(PoisonPill.Instance);
        ExpectTerminated(actor);
        GameView after = View(Spawn(id), id);

        Assert.Equal((before.Seq, before.Fen, "black", "1600"), (after.Seq, after.Fen, after.EngineSide, after.EngineLevel));
    }

    [Fact]
    public void An_answer_for_an_earlier_position_is_refused()
    {
        (Guid id, IActorRef actor) = EngineGame();
        Play(actor, id, "e2e4 e7e5 g1f3");

        AssertRejected(Send(actor, new MakeMove(id, Level.UserId, "b8c6", AtPly: 1)), RejectionCode.Conflict);
        Assert.Equal(4, Assert.IsType<GameView>(Send(actor, new MakeMove(id, Level.UserId, "b8c6", AtPly: 3))).Ply);
    }

    [Fact]
    public void A_silent_engine_is_asked_again_after_the_stall_time_and_again_after_that()
    {
        (Guid id, IActorRef actor) = EngineGame(LongLease);
        GameView afterE4 = Move(actor, id, White, "e2e4");

        Advance(GameTimings.Default.EngineStall - TimeSpan.FromSeconds(1));
        Assert.Empty(Requests.Sent);
        Advance(TimeSpan.FromSeconds(2));
        AwaitCondition(() => Requests.Sent.Count == 1); // the actor re-arms on its own thread before time moves on
        View(actor, id);
        Advance(GameTimings.Default.EngineStall);
        AwaitCondition(() => Requests.Sent.Count == 2);

        Assert.Equal([(id, 1, afterE4.Fen, "1600", true), (id, 1, afterE4.Fen, "1600", true)], Requests.Sent);
    }

    [Fact]
    public void The_persons_presence_reports_never_push_the_engines_stall_back()
    {
        (Guid id, IActorRef actor) = EngineGame(LongLease);
        Move(actor, id, White, "e2e4");

        Report(actor, id, White, present: true);
        Advance(TimeSpan.FromSeconds(30));
        Report(actor, id, White, present: true);
        Advance(GameTimings.Default.EngineStall - TimeSpan.FromSeconds(30) + TimeSpan.FromSeconds(1));

        AwaitCondition(() => Requests.Sent.Count == 1);
    }

    [Fact]
    public void The_engines_first_move_is_never_aborted_but_the_humans_is()
    {
        (Guid id, IActorRef actor) = EngineGame();
        Move(actor, id, White, "e2e4");

        Advance(GameActor.FirstMoveWindow * 3);
        Assert.Equal(GameStatus.Playing, View(actor, id).Status); // the engine is to move: only its stall timer runs

        Move(actor, id, Level.UserId, "e7e5");
        (Guid other, IActorRef fresh) = EngineGame();
        Advance(GameActor.FirstMoveWindow + TimeSpan.FromSeconds(1));
        Assert.Equal(EndReason.Aborted, View(fresh, other).Reason); // a human who never moves still aborts the game
    }

    [Fact]
    public void No_one_is_nudged_while_the_human_is_to_move()
    {
        (Guid id, IActorRef actor) = EngineGame();
        Play(actor, id, "e2e4 e7e5");

        Advance(GameTimings.Default.EngineStall * 3);

        Assert.Empty(Requests.Sent);
    }
}


public sealed class EngineLevelTests
{
    [Fact]
    public void Five_levels_with_distinct_negative_ids_and_engine_subs()
    {
        Assert.Equal(["1320", "1600", "2000", "2400", "max"], EngineLevel.All.Select(l => l.Level));
        Assert.All(EngineLevel.All, l => Assert.True(l.UserId < 0));
        Assert.Equal(EngineLevel.All.Count, EngineLevel.All.Select(l => l.UserId).Distinct().Count());
        Assert.Equal("engine:max", EngineLevel.Find("max")!.Sub);
        Assert.Null(EngineLevel.Find("1800"));
    }

    [Theory]
    [InlineData("white", false, 7L, -2L, "black")]
    [InlineData("black", true, -2L, 7L, "white")]
    [InlineData("random", true, 7L, -2L, "black")]
    [InlineData("random", false, -2L, 7L, "white")]
    public void The_human_takes_their_colour_and_the_engine_the_other(string color, bool coin, long whiteId, long blackId, string engineSide)
    {
        (long white, long black, EnginePlayer engine) = EngineLevel.Find("1600")!.Seat(7, color, () => coin);

        Assert.Equal((whiteId, blackId, new EnginePlayer(engineSide, "1600")), (white, black, engine));
    }
}

