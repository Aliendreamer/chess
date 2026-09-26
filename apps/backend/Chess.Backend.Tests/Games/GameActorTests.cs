using Akka.Actor;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;
using Chess.Backend.Live;

namespace Chess.Backend.Tests.Games;

public sealed class GameActorTests : TestKit
{
    private const long White = 11;
    private const long Black = 22;
    private const long Stranger = 99;
    private static readonly DateTimeOffset T0 = DateTimeOffset.Parse("2026-09-26T10:00:00Z", System.Globalization.CultureInfo.InvariantCulture);
    private static readonly TimeControl Blitz = TimeControl.Presets.Single(tc => tc.ToString() == "5+3");

    public GameActorTests()
        : base("akka.persistence.journal.plugin = \"akka.persistence.journal.inmem\"\nakka.persistence.snapshot-store.plugin = \"akka.persistence.snapshot-store.inmem\"")
    {
    }

    private FakeClock Clock { get; } = new(T0);

    private IActorRef Game(Guid id, IActorRef? mediator = null) =>
        Sys.ActorOf(Props.Create(() => new GameActor(id, mediator, Clock)), $"game-{id:N}-{Guid.NewGuid():N}");

    private (Guid Id, IActorRef Actor) Started(IActorRef? mediator = null)
    {
        Guid id = Guid.CreateVersion7();
        IActorRef actor = Game(id, mediator);
        actor.Tell(new CreateGame(id, White, Black, Blitz));
        ExpectMsg<GameView>();
        return (id, actor);
    }

    private object Send(IActorRef actor, object command)
    {
        actor.Tell(command);
        return ExpectMsg<object>();
    }

    private GameView Move(IActorRef actor, Guid id, long user, string uci) =>
        Assert.IsType<GameView>(Send(actor, new MakeMove(id, user, uci)));

    private GameView PlayLine(IActorRef actor, Guid id, string line)
    {
        GameView view = null!;
        string[] moves = line.Split(' ');
        for (int i = 0; i < moves.Length; i++)
        {
            view = Move(actor, id, i % 2 == 0 ? White : Black, moves[i]);
        }

        return view;
    }

    private GameView View(IActorRef actor, Guid id) => Assert.IsType<GameView>(Send(actor, new GetGameView(id)));

    private static void AssertRejected(object reply, RejectionCode code) =>
        Assert.Equal(code, Assert.IsType<GameRejected>(reply).Code);

    [Fact]
    public void Create_starts_a_game_and_is_idempotent_for_the_same_players()
    {
        Guid id = Guid.CreateVersion7();
        IActorRef actor = Game(id);

        GameView first = Assert.IsType<GameView>(Send(actor, new CreateGame(id, White, Black, Blitz)));
        GameView again = Assert.IsType<GameView>(Send(actor, new CreateGame(id, White, Black, Blitz)));

        Assert.Equal((GameStatus.Created, White, Black, "5+3", "White"), (first.Status, first.WhiteId, first.BlackId, first.TimeControl, first.SideToMove));
        Assert.Equal((300_000L, 300_000L), (first.WhiteMs, first.BlackMs));
        Assert.Equal(first.Seq, again.Seq); // nothing persisted the second time
        AssertRejected(Send(actor, new CreateGame(id, White, Stranger, Blitz)), RejectionCode.Conflict);
    }

    [Fact]
    public void An_unknown_game_answers_not_found() =>
        AssertRejected(Send(Game(Guid.CreateVersion7()), new GetGameView(Guid.Empty)), RejectionCode.NotFound);

    [Fact]
    public void Strangers_out_of_turn_moves_and_illegal_moves_are_rejected_without_persisting()
    {
        (Guid id, IActorRef actor) = Started();
        long seq = View(actor, id).Seq;

        AssertRejected(Send(actor, new MakeMove(id, Stranger, "e2e4")), RejectionCode.Forbidden);
        AssertRejected(Send(actor, new MakeMove(id, Black, "e7e5")), RejectionCode.Conflict);
        AssertRejected(Send(actor, new MakeMove(id, White, "e2e5")), RejectionCode.Illegal);

        Assert.Equal(seq, View(actor, id).Seq);
    }

    [Fact]
    public void A_legal_move_is_recorded_and_survives_a_restart()
    {
        (Guid id, IActorRef actor) = Started();

        GameView after = Move(actor, id, White, "e2e4");

        Assert.Equal((1, "e2e4", "e4", "Black", GameStatus.Playing), (after.Ply, after.LastUci, after.LastSan, after.SideToMove, after.Status));
        Assert.StartsWith("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b", after.Fen, StringComparison.Ordinal);

        Watch(actor);
        Sys.Stop(actor);
        ExpectTerminated(actor);
        GameView recovered = View(Game(id), id);
        Assert.Equal(after with { ClockAt = recovered.ClockAt }, recovered);
    }

    [Fact]
    public void Checkmate_ends_the_game_and_every_later_command_is_a_conflict()
    {
        (Guid id, IActorRef actor) = Started();

        GameView mate = PlayLine(actor, id, "f2f3 e7e5 g2g4 d8h4");

        Assert.Equal((GameStatus.Ended, "0-1", "Checkmate", "Qh4#"), (mate.Status, mate.Result, mate.Reason, mate.LastSan));
        AssertRejected(Send(actor, new MakeMove(id, White, "a2a3")), RejectionCode.Conflict);
        AssertRejected(Send(actor, new OfferDraw(id, White)), RejectionCode.Conflict);
        AssertRejected(Send(actor, new Resign(id, White)), RejectionCode.Conflict);
    }

    [Fact]
    public void Resign_is_refused_before_the_first_move_and_ends_the_game_after_it()
    {
        (Guid id, IActorRef actor) = Started();
        AssertRejected(Send(actor, new Resign(id, White)), RejectionCode.Conflict);

        Move(actor, id, White, "e2e4");
        GameView resigned = Assert.IsType<GameView>(Send(actor, new Resign(id, White)));

        Assert.Equal((GameStatus.Ended, "0-1", "Resignation"), (resigned.Status, resigned.Result, resigned.Reason));
    }

    [Fact]
    public void A_draw_offer_can_be_accepted()
    {
        (Guid id, IActorRef actor) = Started();
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
        (Guid id, IActorRef actor) = Started();
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
        (Guid id, IActorRef actor) = Started();
        Move(actor, id, White, "e2e4");
        Send(actor, new OfferDraw(id, White));

        GameView declined = Assert.IsType<GameView>(Send(actor, new DeclineDraw(id, Black)));

        Assert.Null(declined.DrawOfferedBy);
        AssertRejected(Send(actor, new OfferDraw(id, White)), RejectionCode.Conflict);
    }

    [Fact]
    public void Offering_while_the_opponent_has_an_offer_pending_accepts_it()
    {
        (Guid id, IActorRef actor) = Started();
        Move(actor, id, White, "e2e4");
        Send(actor, new OfferDraw(id, White));

        GameView drawn = Assert.IsType<GameView>(Send(actor, new OfferDraw(id, Black)));

        Assert.Equal((GameStatus.Ended, "Agreement"), (drawn.Status, drawn.Reason));
    }

    [Fact]
    public void Strangers_cannot_offer_accept_resign_or_decline()
    {
        (Guid id, IActorRef actor) = Started();
        Move(actor, id, White, "e2e4");

        foreach (object command in new object[] { new OfferDraw(id, Stranger), new AcceptDraw(id, Stranger), new DeclineDraw(id, Stranger), new Resign(id, Stranger) })
        {
            AssertRejected(Send(actor, command), RejectionCode.Forbidden);
        }
    }

    [Fact]
    public void Every_persisted_event_is_published_as_a_live_frame_with_its_seq()
    {
        TestProbe mediator = CreateTestProbe();
        (Guid id, IActorRef actor) = Started(mediator.Ref);
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
        (Guid id, IActorRef actor) = Started();
        // 16 pawn moves that never repeat a position; X = the position after them (occurrence 1).
        PlayLine(actor, id, "e2e4 e7e5 d2d4 d7d5 c2c4 c7c5 b2b4 b7b5 a2a4 a7a5 h2h4 h7h5 g2g4 g7g5 f2f4 f7f6");
        // Knights out and back: X again (occurrence 2). 1 + 20 events, so a snapshot (every 20) lies in between.
        GameView beforeRestart = PlayLine(actor, id, "g1h3 g8h6 h3g1 h6g8");
        Assert.Equal(GameStatus.Playing, beforeRestart.Status);

        Watch(actor);
        Sys.Stop(actor);
        ExpectTerminated(actor);
        IActorRef recovered = Game(id);
        Assert.Equal(20, View(recovered, id).Ply);

        // Occurrence 3 — only detectable if recovery rebuilt the history, not just the position.
        GameView end = PlayLine(recovered, id, "g1h3 g8h6 h3g1 h6g8");
        Assert.Equal((GameStatus.Ended, "1/2-1/2", "ThreefoldRepetition"), (end.Status, end.Result, end.Reason));
    }
}
