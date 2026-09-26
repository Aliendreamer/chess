using Akka.Actor;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.TestKit;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;
using Chess.Backend.Live;

namespace Chess.Backend.Tests.Games;

public sealed class GameActorTests() : GameActorTestBase(virtualTime: false)
{
    private static readonly TimeControl Blitz = Tc("5+3");

    [Fact]
    public void Create_starts_a_game_and_is_idempotent_for_the_same_players()
    {
        Guid id = Guid.CreateVersion7();
        IActorRef actor = Spawn(id);

        GameView first = Assert.IsType<GameView>(Send(actor, new CreateGame(id, White, Black, Blitz)));
        GameView again = Assert.IsType<GameView>(Send(actor, new CreateGame(id, White, Black, Blitz)));

        Assert.Equal((GameStatus.Created, White, Black, "5+3", "White"), (first.Status, first.WhiteId, first.BlackId, first.TimeControl, first.SideToMove));
        Assert.Equal((300_000L, 300_000L), (first.WhiteMs, first.BlackMs));
        Assert.Equal(first.Seq, again.Seq); // nothing persisted the second time
        AssertRejected(Send(actor, new CreateGame(id, White, Stranger, Blitz)), RejectionCode.Conflict);
    }

    [Fact]
    public void An_unknown_game_answers_not_found() =>
        AssertRejected(Send(Spawn(Guid.CreateVersion7()), new GetGameView(Guid.Empty)), RejectionCode.NotFound);

    [Fact]
    public void Out_of_turn_and_illegal_moves_are_rejected_without_persisting()
    {
        (Guid id, IActorRef actor, _) = Started();
        long seq = View(actor, id).Seq;

        AssertRejected(Send(actor, new MakeMove(id, Black, "e7e5")), RejectionCode.Conflict);
        AssertRejected(Send(actor, new MakeMove(id, White, "e2e5")), RejectionCode.Illegal);

        Assert.Equal(seq, View(actor, id).Seq);
    }

    [Fact]
    public void A_legal_move_is_recorded_and_survives_a_restart()
    {
        (Guid id, IActorRef actor, _) = Started();

        GameView after = Move(actor, id, White, "e2e4");

        Assert.Equal((1, "e2e4", "e4", "Black", GameStatus.Playing), (after.Ply, after.LastUci, after.LastSan, after.SideToMove, after.Status));
        Assert.StartsWith("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b", after.Fen, StringComparison.Ordinal);

        StopAndWait(actor);
        GameView recovered = View(Spawn(id), id);
        Assert.Equal(after with { ClockAt = recovered.ClockAt }, recovered);
    }

    [Fact]
    public void Checkmate_ends_the_game_and_every_later_command_is_a_conflict()
    {
        (Guid id, IActorRef actor, _) = Started();

        GameView mate = PlayLine(actor, id, "f2f3 e7e5 g2g4 d8h4");

        Assert.Equal((GameStatus.Ended, "0-1", "Checkmate", "Qh4#"), (mate.Status, mate.Result, mate.Reason, mate.LastSan));
        AssertRejected(Send(actor, new MakeMove(id, White, "a2a3")), RejectionCode.Conflict);
        AssertRejected(Send(actor, new OfferDraw(id, White)), RejectionCode.Conflict);
        AssertRejected(Send(actor, new Resign(id, White)), RejectionCode.Conflict);
    }

    [Fact]
    public void Resign_is_refused_before_the_first_move_and_ends_the_game_after_it()
    {
        (Guid id, IActorRef actor, _) = Started();
        AssertRejected(Send(actor, new Resign(id, White)), RejectionCode.Conflict);

        Move(actor, id, White, "e2e4");
        GameView resigned = Assert.IsType<GameView>(Send(actor, new Resign(id, White)));

        Assert.Equal((GameStatus.Ended, "0-1", "Resignation"), (resigned.Status, resigned.Result, resigned.Reason));
    }

    [Fact]
    public void A_draw_offer_can_be_accepted()
    {
        (Guid id, IActorRef actor, _) = Started();
        Move(actor, id, White, "e2e4");

        GameView offered = Assert.IsType<GameView>(Send(actor, new OfferDraw(id, White)));
        Assert.Equal(White, offered.DrawOfferedBy);
        AssertRejected(Send(actor, new AcceptDraw(id, White)), RejectionCode.Conflict); // can't accept your own

        GameView drawn = Assert.IsType<GameView>(Send(actor, new AcceptDraw(id, Black)));
        Assert.Equal((GameStatus.Ended, "1/2-1/2", "Agreement"), (drawn.Status, drawn.Result, drawn.Reason));
    }

    [Fact]
    public void A_draw_offer_lapses_when_the_opponent_moves_and_cannot_be_repeated_until_the_offerer_moves()
    {
        (Guid id, IActorRef actor, _) = Started();
        Move(actor, id, White, "e2e4");
        Send(actor, new OfferDraw(id, White));

        GameView lapsed = Move(actor, id, Black, "e7e5");
        Assert.Null(lapsed.DrawOfferedBy);
        AssertRejected(Send(actor, new AcceptDraw(id, Black)), RejectionCode.Conflict);
        AssertRejected(Send(actor, new OfferDraw(id, White)), RejectionCode.Conflict); // blocked until White moves

        Move(actor, id, White, "g1f3");
        Assert.Equal(White, Assert.IsType<GameView>(Send(actor, new OfferDraw(id, White))).DrawOfferedBy);
    }

    [Fact]
    public void A_declined_offer_clears_and_blocks_the_offerer_until_they_move()
    {
        (Guid id, IActorRef actor, _) = Started();
        Move(actor, id, White, "e2e4");
        Send(actor, new OfferDraw(id, White));

        GameView declined = Assert.IsType<GameView>(Send(actor, new DeclineDraw(id, Black)));

        Assert.Null(declined.DrawOfferedBy);
        AssertRejected(Send(actor, new OfferDraw(id, White)), RejectionCode.Conflict);
    }

    [Fact]
    public void Offering_while_the_opponent_has_an_offer_pending_accepts_it()
    {
        (Guid id, IActorRef actor, _) = Started();
        Move(actor, id, White, "e2e4");
        Send(actor, new OfferDraw(id, White));

        GameView drawn = Assert.IsType<GameView>(Send(actor, new OfferDraw(id, Black)));

        Assert.Equal((GameStatus.Ended, "Agreement"), (drawn.Status, drawn.Reason));
    }

    [Fact]
    public void Strangers_cannot_move_offer_accept_resign_or_decline()
    {
        (Guid id, IActorRef actor, _) = Started();
        long seq = Move(actor, id, White, "e2e4").Seq;

        foreach (object command in new object[] { new MakeMove(id, Stranger, "e7e5"), new OfferDraw(id, Stranger), new AcceptDraw(id, Stranger), new DeclineDraw(id, Stranger), new Resign(id, Stranger) })
        {
            AssertRejected(Send(actor, command), RejectionCode.Forbidden);
        }

        Assert.Equal(seq, View(actor, id).Seq);
    }

    [Fact]
    public void Every_persisted_event_is_published_as_a_live_frame_with_its_seq()
    {
        TestProbe mediator = CreateTestProbe();
        (Guid id, IActorRef actor, _) = Started(mediator: mediator.Ref);
        Publish created = mediator.ExpectMsg<Publish>();

        GameView moved = Move(actor, id, White, "e2e4");
        Publish afterMove = mediator.ExpectMsg<Publish>();

        Assert.Equal(LiveTopics.PubSub, afterMove.Topic);
        LiveFrame frame = Assert.IsType<LiveFrame>(afterMove.Message);
        Assert.Equal(($"game:{id:N}", moved.Seq), (frame.Topic, frame.Seq));
        Assert.Equal(moved, frame.Payload);
        Assert.True(((LiveFrame)created.Message).Seq < frame.Seq);
    }

    [Fact]
    public void Threefold_repetition_across_a_snapshot_and_a_restart_still_ends_the_game()
    {
        (Guid id, IActorRef actor, _) = Started();
        // 16 pawn moves that never repeat a position; X = the position after them (occurrence 1).
        PlayLine(actor, id, "e2e4 e7e5 d2d4 d7d5 c2c4 c7c5 b2b4 b7b5 a2a4 a7a5 h2h4 h7h5 g2g4 g7g5 f2f4 f7f6");
        // Knights out and back: X again (occurrence 2). 1 + 20 events, so a snapshot (every 20) lies in between.
        GameView beforeRestart = PlayLine(actor, id, "g1h3 g8h6 h3g1 h6g8");
        Assert.Equal(GameStatus.Playing, beforeRestart.Status);

        StopAndWait(actor);
        IActorRef recovered = Spawn(id);
        Assert.Equal(20, View(recovered, id).Ply);

        // Occurrence 3 — only detectable if recovery rebuilt the history, not just the position.
        GameView end = PlayLine(recovered, id, "g1h3 g8h6 h3g1 h6g8");
        Assert.Equal((GameStatus.Ended, "1/2-1/2", "ThreefoldRepetition"), (end.Status, end.Result, end.Reason));
    }
}
