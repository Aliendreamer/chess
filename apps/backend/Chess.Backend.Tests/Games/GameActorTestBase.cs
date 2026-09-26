using Akka.Actor;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;

namespace Chess.Backend.Tests.Games;

/// <summary>
/// Shared harness for <see cref="GameActor"/> tests: players, a <see cref="FakeClock"/> the actor reads as "now",
/// and command helpers. With <c>virtualTime</c> Akka's <see cref="TestScheduler"/> fires the actor's timers, and
/// <see cref="Advance"/> moves it together with the clock.
/// </summary>
public abstract class GameActorTestBase(bool virtualTime)
    : TestKit(virtualTime ? AkkaConfig.InMemoryPersistenceWithTestScheduler : AkkaConfig.InMemoryPersistence)
{
    protected const long White = 11;
    protected const long Black = 22;
    protected const long Stranger = 99;

    private protected FakeClock Clock { get; } = new(Time.Utc("2026-09-26T10:00:00Z"));

    private protected static TimeControl Tc(string text) => TimeControl.Presets.Single(tc => tc.ToString() == text);

    /// <summary>Moves the actor's clock and fires due timers; only valid with virtual time.</summary>
    private protected void Advance(TimeSpan by)
    {
        Clock.Advance(by);
        ((TestScheduler)Sys.Scheduler).Advance(by);
    }

    private protected Props GameProps(Guid id, IActorRef? mediator = null) => Props.Create(() => new GameActor(id, mediator, Clock));

    /// <summary>A fresh incarnation of game <paramref name="id"/>, recovering whatever its journal holds.</summary>
    private protected IActorRef Spawn(Guid id) => Sys.ActorOf(GameProps(id));

    /// <summary>A created game under a probe parent (which receives <c>Passivate</c>).</summary>
    private protected (Guid Id, IActorRef Actor, TestProbe Parent) Started(string tc = "5+3", IActorRef? mediator = null)
    {
        Guid id = Guid.CreateVersion7();
        TestProbe parent = CreateTestProbe();
        IActorRef actor = parent.ChildActorOf(GameProps(id, mediator));
        actor.Tell(new CreateGame(id, White, Black, Tc(tc)), TestActor);
        ExpectMsg<GameView>();
        return (id, actor, parent);
    }

    private protected object Send(IActorRef actor, object command)
    {
        actor.Tell(command, TestActor);
        return ExpectMsg<object>();
    }

    private protected GameView Move(IActorRef actor, Guid id, long user, string uci) =>
        Assert.IsType<GameView>(Send(actor, new MakeMove(id, user, uci)));

    /// <summary>Plays space-separated UCI moves alternately from White and returns the last view.</summary>
    private protected GameView PlayLine(IActorRef actor, Guid id, string line)
    {
        GameView view = null!;
        string[] moves = line.Split(' ');
        for (int i = 0; i < moves.Length; i++)
        {
            view = Move(actor, id, i % 2 == 0 ? White : Black, moves[i]);
        }

        return view;
    }

    /// <summary>Both first moves: from here White's clock runs.</summary>
    private protected void Opened(IActorRef actor, Guid id) => PlayLine(actor, id, "e2e4 e7e5");

    private protected GameView View(IActorRef actor, Guid id) => Assert.IsType<GameView>(Send(actor, new GetGameView(id)));

    private protected void StopAndWait(IActorRef actor)
    {
        Watch(actor);
        Sys.Stop(actor);
        ExpectTerminated(actor);
    }

    private protected static void AssertRejected(object reply, RejectionCode code) =>
        Assert.Equal(code, Assert.IsType<GameRejected>(reply).Code);
}
