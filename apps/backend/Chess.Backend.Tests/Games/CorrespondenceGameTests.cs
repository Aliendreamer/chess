using Akka.Actor;
using Akka.Cluster.Sharding;
using Akka.TestKit;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;

namespace Chess.Backend.Tests.Games;

/// <summary>Correspondence games (correspondence-games D1–D2) under virtual time: a week per move, no clock, no presence.</summary>
public sealed class CorrespondenceGameTests() : GameActorTestBase(virtualTime: true)
{
    private static readonly TimeSpan Week = GameTimings.Default.MoveDeadline;

    private (Guid Id, IActorRef Actor, TestProbe Parent) StartedCorrespondence()
    {
        Guid id = Guid.CreateVersion7();
        TestProbe parent = CreateTestProbe();
        IActorRef actor = parent.ChildActorOf(GameProps(id));
        GameView created = Assert.IsType<GameView>(Send(actor, new CreateGame(id, White, Black, TimeControl.Correspondence7)));
        Assert.Equal(("7d", Clock.Now + Week), (created.TimeControl, created.DeadlineAt));
        return (id, actor, parent);
    }

    private GameView Check(IActorRef actor, Guid id)
    {
        actor.Tell(new CheckDeadline(id));
        return View(actor, id);
    }

    [Fact]
    public void The_deadline_resets_after_every_move_and_no_clock_runs()
    {
        (Guid id, IActorRef actor, _) = StartedCorrespondence();

        Advance(TimeSpan.FromDays(5));
        GameView afterE4 = Move(actor, id, White, "e2e4");
        Advance(TimeSpan.FromDays(6));
        GameView afterE5 = Move(actor, id, Black, "e7e5");

        Assert.Equal(Clock.Now - TimeSpan.FromDays(6) + Week, afterE4.DeadlineAt);
        Assert.Equal(Clock.Now + Week, afterE5.DeadlineAt);
        Assert.Equal((GameStatus.Playing, 0L, 0L), (afterE5.Status, afterE5.WhiteMs, afterE5.BlackMs));
    }

    [Fact]
    public void The_live_first_move_abort_does_not_apply()
    {
        (Guid id, IActorRef actor, _) = StartedCorrespondence();

        Advance(TimeSpan.FromHours(3));

        Assert.Equal(GameStatus.Created, View(actor, id).Status);
    }

    [Fact]
    public void An_early_check_changes_nothing_and_a_due_one_aborts_an_unstarted_game()
    {
        (Guid id, IActorRef actor, _) = StartedCorrespondence();

        Advance(Week - TimeSpan.FromMinutes(1));
        long seq = Check(actor, id).Seq;
        Advance(TimeSpan.FromMinutes(2));
        GameView ended = Check(actor, id);

        Assert.Equal(1, seq);
        Assert.Equal((GameStatus.Ended, "*", "Aborted"), (ended.Status, ended.Result, ended.Reason));
        Assert.Null(ended.DeadlineAt);
    }

    [Fact]
    public void A_missed_deadline_after_both_first_moves_loses_on_time_once()
    {
        (Guid id, IActorRef actor, _) = StartedCorrespondence();
        PlayLine(actor, id, "e2e4 e7e5 g1f3");

        Advance(Week + TimeSpan.FromSeconds(1));
        GameView ended = Check(actor, id);
        GameView again = Check(actor, id);

        Assert.Equal((GameStatus.Ended, "1-0", "Timeout"), (ended.Status, ended.Result, ended.Reason));
        Assert.Equal(ended.Seq, again.Seq); // the second check persisted nothing
    }

    [Fact]
    public void A_move_after_the_deadline_comes_too_late()
    {
        (Guid id, IActorRef actor, _) = StartedCorrespondence();
        PlayLine(actor, id, "e2e4 e7e5");

        Advance(Week + TimeSpan.FromSeconds(1));
        object reply = Send(actor, new MakeMove(id, White, "g1f3"));

        GameView view = Assert.IsType<GameView>(reply);
        Assert.Equal((GameStatus.Ended, "0-1", "Timeout", 2), (view.Status, view.Result, view.Reason, view.Ply));
    }

    [Fact]
    public void Presence_is_ignored()
    {
        (Guid id, IActorRef actor, _) = StartedCorrespondence();
        long seq = PlayLine(actor, id, "e2e4 e7e5").Seq;

        actor.Tell(new ReportPresence(id, Black, "bff-1", Present: true));
        actor.Tell(new ReportPresence(id, Black, "bff-1", Present: false));
        Advance(TimeSpan.FromMinutes(10));

        GameView view = View(actor, id);
        Assert.Equal((seq, (long?)null), (view.Seq, view.ClaimableBy));
    }

    [Fact]
    public void An_idle_game_passivates_and_recovers_with_its_deadline()
    {
        (Guid id, IActorRef actor, TestProbe parent) = StartedCorrespondence();
        GameView before = PlayLine(actor, id, "e2e4 e7e5 g1f3");

        Advance(GameTimings.Default.UntimedIdle + TimeSpan.FromMinutes(1));
        parent.ExpectMsg<Passivate>();
        Watch(actor);
        actor.Tell(PoisonPill.Instance);
        ExpectTerminated(actor);

        GameView after = View(Spawn(id), id);
        Assert.Equal((before.Seq, before.DeadlineAt), (after.Seq, after.DeadlineAt));
    }

    [Fact]
    public void A_live_game_ignores_a_deadline_check()
    {
        (Guid id, IActorRef actor, _) = Started("5+3");

        Advance(TimeSpan.FromSeconds(30));
        GameView view = Check(actor, id);

        Assert.Equal((GameStatus.Created, (DateTimeOffset?)null), (view.Status, view.DeadlineAt));
    }
}
