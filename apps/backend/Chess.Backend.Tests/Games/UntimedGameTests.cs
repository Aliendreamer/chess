using Akka.Actor;
using Akka.Cluster.Sharding;
using Akka.TestKit;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;

namespace Chess.Backend.Tests.Games;

/// <summary>Untimed games (engine-play D4) under virtual time: no clock, no flag, the first-move abort, idle passivation.</summary>
public sealed class UntimedGameTests() : GameActorTestBase(virtualTime: true)
{
    private (Guid Id, IActorRef Actor, TestProbe Parent) StartedUntimed()
    {
        Guid id = Guid.CreateVersion7();
        TestProbe parent = CreateTestProbe();
        IActorRef actor = parent.ChildActorOf(GameProps(id));
        actor.Tell(new CreateGame(id, White, Black, TimeControl.Untimed), TestActor);
        ExpectMsg<GameView>();
        return (id, actor, parent);
    }

    [Fact]
    public void No_clock_runs_and_no_flag_falls_however_long_a_move_takes()
    {
        (Guid id, IActorRef actor, _) = StartedUntimed();
        Opened(actor, id);

        Advance(TimeSpan.FromHours(2));
        GameView waited = View(actor, id);
        GameView moved = Move(actor, id, White, "g1f3");

        Assert.Equal((GameStatus.Playing, "untimed", 0L, 0L), (waited.Status, waited.TimeControl, waited.WhiteMs, waited.BlackMs));
        Assert.Equal((GameStatus.Playing, 0L, 0L), (moved.Status, moved.WhiteMs, moved.BlackMs));
    }

    [Fact]
    public void A_first_move_that_never_comes_still_aborts_the_game()
    {
        (Guid id, IActorRef actor, _) = StartedUntimed();

        Advance(GameActor.FirstMoveWindow + TimeSpan.FromSeconds(1));

        GameView view = View(actor, id);
        Assert.Equal((GameStatus.Ended, "Aborted"), (view.Status, view.Reason));
    }

    [Fact]
    public void An_idle_game_under_way_passivates_and_comes_back_unchanged()
    {
        (Guid id, IActorRef actor, TestProbe parent) = StartedUntimed();
        GameView before = PlayLine(actor, id, "e2e4 e7e5 g1f3");

        Advance(GameTimings.Default.UntimedIdle - TimeSpan.FromMinutes(1));
        parent.ExpectNoMsg(TimeSpan.FromMilliseconds(100));
        Advance(TimeSpan.FromMinutes(2));
        parent.ExpectMsg<Passivate>();

        Watch(actor);
        actor.Tell(PoisonPill.Instance);
        ExpectTerminated(actor);
        GameView after = View(Spawn(id), id);
        Assert.Equal((before.Fen, before.Ply, before.Seq, GameStatus.Playing), (after.Fen, after.Ply, after.Seq, after.Status));
    }
}
