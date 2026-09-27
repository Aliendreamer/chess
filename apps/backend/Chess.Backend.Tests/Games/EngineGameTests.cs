using Akka.Actor;
using Akka.TestKit;
using Chess.Backend.Akka.Games;
using Chess.Backend.Events;
using Chess.Backend.Games;

namespace Chess.Backend.Tests.Games;

/// <summary>Games against the engine (engine-play D2–D5): the engine's seat, no draw offers, no presence, recovery.</summary>
public sealed class EngineGameTests() : GameActorTestBase(virtualTime: true)
{
    private static readonly EngineLevel Level = EngineLevel.Find("1600")!;
    private static readonly EnginePlayer AsBlack = new("black", "1600");

    /// <summary>The Breyer Ruy Lopez to move 11: 22 plies, past a snapshot (every 20 events).</summary>
    private const string LongLine = "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8 h2h3 c6b8 d2d4 b8d7 c3c4 c7c6";

    private (Guid Id, IActorRef Actor) EngineGame()
    {
        Guid id = Guid.CreateVersion7();
        IActorRef actor = CreateTestProbe().ChildActorOf(GameProps(id));
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

    [Fact]
    public void Presence_is_ignored_so_no_abandonment_is_ever_offered()
    {
        (Guid id, IActorRef actor) = EngineGame();
        long seq = Play(actor, id, "e2e4 e7e5").Seq;

        actor.Tell(new ReportPresence(id, White, "bff-1", Present: true));
        actor.Tell(new ReportPresence(id, White, "bff-1", Present: false));
        Advance(TimeSpan.FromMinutes(10));

        GameView view = View(actor, id);
        Assert.Equal((seq, (long?)null, (long?)null), (view.Seq, view.AbsentId, view.ClaimableBy));
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
}
