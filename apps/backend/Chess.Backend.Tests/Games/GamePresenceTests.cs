using Akka.Actor;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.TestKit;
using Chess.Backend.Akka.Games;
using Chess.Backend.Live;

namespace Chess.Backend.Tests.Games;

/// <summary>
/// Presence and abandonment (presence-and-abandonment D2–D5) under virtual time: the BFF's reports, the 75 s lease,
/// the 60 s claim, and recovery forgiveness.
/// </summary>
public sealed class GamePresenceTests() : GameActorTestBase(virtualTime: true)
{
    private const string Bff = "bff-1";
    private const string OtherBff = "bff-2";

    /// <summary>Reports presence and waits until the actor has handled it (reports have no reply of their own).</summary>
    private void Report(IActorRef actor, Guid id, long user, bool present, string instance = Bff)
    {
        actor.Tell(new ReportPresence(id, user, instance, present), TestActor);
        View(actor, id);
    }

    /// <summary>A game past both first moves with both players reported present by one BFF.</summary>
    private (Guid Id, IActorRef Actor) InPlay(IActorRef? mediator = null)
    {
        (Guid id, IActorRef actor, _) = Started("30+20", mediator);
        Report(actor, id, White, present: true);
        Report(actor, id, Black, present: true);
        Opened(actor, id);
        return (id, actor);
    }

    [Fact]
    public void The_last_instance_leaving_marks_the_player_absent_and_the_claim_opens_after_a_minute()
    {
        (Guid id, IActorRef actor) = InPlay();

        Report(actor, id, Black, present: false);
        GameView left = View(actor, id);
        Advance(TimeSpan.FromSeconds(59));
        Report(actor, id, White, present: true); // White's BFF keeps refreshing
        GameView almost = View(actor, id);
        Advance(TimeSpan.FromSeconds(1));

        Assert.Equal((Black, (long?)null), (left.AbsentId, left.ClaimableBy));
        Assert.Null(almost.ClaimableBy);
        Assert.Equal(White, View(actor, id).ClaimableBy);
    }

    [Fact]
    public void The_claim_is_published_live_when_the_minute_is_up()
    {
        TestProbe mediator = CreateTestProbe();
        (Guid id, IActorRef actor) = InPlay(mediator.Ref);
        mediator.ReceiveWhile(TimeSpan.FromMilliseconds(300), m => m); // creation and the opening moves
        Report(actor, id, Black, present: false);
        mediator.ExpectMsg<Publish>(); // PlayerLeft

        Advance(TimeSpan.FromSeconds(60));

        GameView frame = Assert.IsType<GameView>(Assert.IsType<LiveFrame>(mediator.ExpectMsg<Publish>().Message).Payload);
        Assert.Equal(White, frame.ClaimableBy);
    }

    [Fact]
    public void A_player_with_another_tab_open_is_still_present()
    {
        (Guid id, IActorRef actor) = InPlay();
        Report(actor, id, Black, present: true, OtherBff);

        Report(actor, id, Black, present: false);

        Assert.Null(View(actor, id).AbsentId);
    }

    [Fact]
    public void An_instance_that_stops_refreshing_expires_after_75_seconds()
    {
        (Guid id, IActorRef actor) = InPlay();

        Advance(TimeSpan.FromSeconds(30));
        Report(actor, id, White, present: true);
        Advance(TimeSpan.FromSeconds(30));
        Report(actor, id, White, present: true);
        GameView beforeExpiry = View(actor, id);
        Advance(TimeSpan.FromSeconds(15)); // 75 s since Black's last report

        Assert.Null(beforeExpiry.AbsentId);
        Assert.Equal(Black, View(actor, id).AbsentId);
    }

    [Fact]
    public void A_return_before_the_minute_takes_the_claim_away()
    {
        (Guid id, IActorRef actor) = InPlay();
        Report(actor, id, Black, present: false);
        Advance(TimeSpan.FromSeconds(50));

        Report(actor, id, Black, present: true);
        Report(actor, id, White, present: true);
        Advance(TimeSpan.FromSeconds(20));

        GameView view = View(actor, id);
        Assert.Equal(((long?)null, (long?)null), (view.AbsentId, view.ClaimableBy));
        AssertRejected(Send(actor, new ClaimAbandonment(id, White, Win: true)), RejectionCode.Conflict);
    }

    [Fact]
    public void Claiming_the_win_ends_the_game_by_abandonment()
    {
        (Guid id, IActorRef actor) = Abandoned();

        GameView ended = Assert.IsType<GameView>(Send(actor, new ClaimAbandonment(id, White, Win: true)));

        Assert.Equal((GameStatus.Ended, "1-0", "Abandonment"), (ended.Status, ended.Result, ended.Reason));
        Assert.Null(ended.ClaimableBy);
    }

    [Fact]
    public void Calling_it_a_draw_ends_the_game_by_abandonment()
    {
        (Guid id, IActorRef actor) = Abandoned();

        GameView ended = Assert.IsType<GameView>(Send(actor, new ClaimAbandonment(id, White, Win: false)));

        Assert.Equal(("1/2-1/2", "Abandonment"), (ended.Result, ended.Reason));
    }

    [Fact]
    public void Only_the_player_offered_the_claim_may_make_it_and_not_early()
    {
        (Guid id, IActorRef actor) = InPlay();
        Report(actor, id, Black, present: false);
        Advance(TimeSpan.FromSeconds(30));
        Report(actor, id, White, present: true);

        AssertRejected(Send(actor, new ClaimAbandonment(id, White, Win: true)), RejectionCode.Conflict); // too early
        Advance(TimeSpan.FromSeconds(31));
        AssertRejected(Send(actor, new ClaimAbandonment(id, Black, Win: true)), RejectionCode.Conflict); // the absent one
        AssertRejected(Send(actor, new ClaimAbandonment(id, Stranger, Win: true)), RejectionCode.Forbidden);
    }

    [Fact]
    public void Leaving_before_both_first_moves_is_not_an_absence()
    {
        (Guid id, IActorRef actor, _) = Started("30+20");
        Report(actor, id, White, present: true);
        Report(actor, id, Black, present: true);
        Move(actor, id, White, "e2e4");

        Report(actor, id, Black, present: false);
        Advance(TimeSpan.FromSeconds(10));

        Assert.Null(View(actor, id).AbsentId);
    }

    [Fact]
    public void Reports_about_someone_who_is_not_playing_change_nothing()
    {
        (Guid id, IActorRef actor) = InPlay();
        long seq = View(actor, id).Seq;

        Report(actor, id, Stranger, present: true);
        Report(actor, id, Stranger, present: false);

        Assert.Equal(seq, View(actor, id).Seq);
    }

    [Fact]
    public void A_game_nobody_reports_on_never_tracks_absence()
    {
        (Guid id, IActorRef actor, _) = Started("30+20");
        Opened(actor, id);

        Advance(TimeSpan.FromMinutes(5));

        GameView view = View(actor, id);
        Assert.Equal(((long?)null, (long?)null), (view.AbsentId, view.ClaimableBy));
    }

    [Fact]
    public void After_a_restart_the_absence_minute_starts_again_and_the_other_player_is_presumed_present()
    {
        (Guid id, IActorRef actor) = InPlay();
        Report(actor, id, Black, present: false);
        Advance(TimeSpan.FromSeconds(50));

        StopAndWait(actor);
        IActorRef recovered = Spawn(id);
        GameView afterRestart = View(recovered, id);
        Advance(TimeSpan.FromSeconds(50)); // 100 s since Black left, but only 50 since the recovery
        GameView stillWaiting = View(recovered, id);
        Advance(TimeSpan.FromSeconds(11)); // no report from White yet, but within 75 s of the recovery

        Assert.Equal((Black, (long?)null), (afterRestart.AbsentId, afterRestart.ClaimableBy));
        Assert.Null(stillWaiting.ClaimableBy);
        Assert.Equal(White, View(recovered, id).ClaimableBy);
    }

    [Fact]
    public void An_absence_survives_a_restart_from_a_snapshot()
    {
        (Guid id, IActorRef actor) = InPlay();
        for (int i = 0; i < GameActor.SnapshotEvery / 2; i++) // enough PlayerLeft/PlayerReturned for a snapshot
        {
            Report(actor, id, Black, present: false);
            Report(actor, id, Black, present: true);
        }

        Report(actor, id, Black, present: false);
        StopAndWait(actor);
        IActorRef recovered = Spawn(id);
        View(recovered, id); // recovery done (it restarts the absence) before the clock moves
        Advance(TimeSpan.FromSeconds(61));

        GameView view = View(recovered, id);
        Assert.Equal((Black, (long?)White), (view.AbsentId, view.ClaimableBy));
    }

    /// <summary>Black left a minute ago while White stayed.</summary>
    private (Guid Id, IActorRef Actor) Abandoned()
    {
        (Guid id, IActorRef actor) = InPlay();
        Report(actor, id, Black, present: false);
        Advance(TimeSpan.FromSeconds(30));
        Report(actor, id, White, present: true);
        Advance(TimeSpan.FromSeconds(30));
        Assert.Equal(White, View(actor, id).ClaimableBy);
        return (id, actor);
    }
}
