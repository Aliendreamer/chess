using Akka.Actor;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Events;
using Chess.Backend.Games;
using Chess.Backend.Messaging;

namespace Chess.Backend.Tests.Matchmaking;

public sealed class InviteActorTests() : TestKit(AkkaConfig.InMemoryPersistence)
{
    private const long Creator = 1;
    private const long Friend = 2;
    private const long Stranger = 3;

    private FakeClock Clock { get; } = new(Time.Utc("2026-09-26T10:00:00Z"));

    private sealed class FakeStarter : IGameStarter
    {
        public List<(long White, long Black, string Tc, Guid GameId)> Started { get; } = [];

        public Task<GameView> StartAsync(long whiteId, long blackId, TimeControl timeControl, CancellationToken ct, EnginePlayer? engine = null)
        {
            Guid id = Guid.CreateVersion7();
            lock (Started)
            {
                Started.Add((whiteId, blackId, timeControl.ToString(), id));
            }

            return Task.FromResult(new GameView(id, whiteId, blackId, timeControl.ToString(), GameStatus.Created, "fen", 0, Side.White, null, null, 0, 0, DateTimeOffset.UnixEpoch, null, null, null, 1));
        }
    }

    private FakeStarter Starter { get; } = new();

    private Props InviteProps(Guid id, IActorRef? mediator = null, int seed = 7) =>
        Props.Create(() => new InviteActor(id, Starter, mediator, Clock, new Random(seed)));

    private (Guid Id, IActorRef Actor) Created(string color = "black", string tc = "10+5", IActorRef? mediator = null)
    {
        Guid id = Guid.NewGuid();
        IActorRef actor = Sys.ActorOf(InviteProps(id, mediator));
        InviteView view = Assert.IsType<InviteView>(Send(actor, new CreateInvite(id, Creator, tc, color)));
        Assert.Equal(InviteStatus.Open, view.Status);
        return (id, actor);
    }

    private object Send(IActorRef actor, object command)
    {
        actor.Tell(command);
        return ExpectMsg<object>();
    }

    private static void AssertRejected(object reply, string code) =>
        Assert.Equal(code, Assert.IsType<InviteRejected>(reply).Code.ToString());

    [Fact]
    public void A_created_invite_is_open_for_24_hours()
    {
        (Guid id, IActorRef actor) = Created();

        InviteView view = Assert.IsType<InviteView>(Send(actor, new GetInvite(id)));

        Assert.Equal((Creator, "10+5", "black", InviteStatus.Open, (Guid?)null), (view.CreatorId, view.TimeControl, view.Color, view.Status, view.GameId));
        Assert.Equal(Time.Utc("2026-09-27T10:00:00Z"), view.ExpiresAt);
    }

    [Fact]
    public void Accepting_starts_the_game_with_the_creators_colour_honoured()
    {
        (Guid id, IActorRef actor) = Created(color: "black");

        InviteView accepted = Assert.IsType<InviteView>(Send(actor, new AcceptInvite(id, Friend)));

        (long white, long black, string tc, Guid gameId) = Assert.Single(Starter.Started);
        Assert.Equal((Friend, Creator, "10+5"), (white, black, tc)); // creator chose black, so the friend is White
        Assert.Equal((InviteStatus.Accepted, (Guid?)gameId), (accepted.Status, accepted.GameId));
    }

    [Fact]
    public void A_white_invite_makes_the_creator_white() =>
        Assert.Equal(Creator, Accepted("white").White);

    [Fact]
    public void A_random_colour_is_resolved_once_and_both_outcomes_occur()
    {
        long[] whites = [.. new[] { 1, 2, 3, 4, 5, 6 }.Select(seed =>
        {
            Guid id = Guid.NewGuid();
            IActorRef actor = Sys.ActorOf(InviteProps(id, seed: seed));
            Send(actor, new CreateInvite(id, Creator, "5+3", "random"));
            Send(actor, new AcceptInvite(id, Friend));
            return Starter.Started[^1].White;
        })];

        Assert.Equal([Creator, Friend], whites.Distinct().Order());
    }

    private (long White, long Black) Accepted(string color)
    {
        (Guid id, IActorRef actor) = Created(color: color);
        Send(actor, new AcceptInvite(id, Friend));
        (long white, long black, _, _) = Starter.Started[^1];
        return (white, black);
    }

    [Fact]
    public void A_second_accept_is_a_conflict_and_starts_nothing()
    {
        (Guid id, IActorRef actor) = Created();
        Send(actor, new AcceptInvite(id, Friend));

        AssertRejected(Send(actor, new AcceptInvite(id, Stranger)), "Conflict");

        Assert.Single(Starter.Started);
    }

    [Fact]
    public void Two_accepts_sent_back_to_back_start_one_game()
    {
        (Guid id, IActorRef actor) = Created();

        actor.Tell(new AcceptInvite(id, Friend));
        actor.Tell(new AcceptInvite(id, Stranger)); // arrives while the first start is in flight
        object first = ExpectMsg<object>();
        object second = ExpectMsg<object>();

        Assert.IsType<InviteView>(first);
        AssertRejected(second, "Conflict");
        Assert.Single(Starter.Started);
    }

    [Fact]
    public void The_creator_cannot_accept_their_own_invite() =>
        AssertRejected(Send(Created().Actor, new AcceptInvite(Guid.Empty, Creator)), "Conflict");

    [Fact]
    public void Only_the_creator_can_cancel_and_a_cancelled_invite_refuses_accept()
    {
        (Guid id, IActorRef actor) = Created();

        AssertRejected(Send(actor, new CancelInvite(id, Stranger)), "Forbidden");
        Assert.Equal(InviteStatus.Cancelled, Assert.IsType<InviteView>(Send(actor, new CancelInvite(id, Creator))).Status);
        AssertRejected(Send(actor, new AcceptInvite(id, Friend)), "Conflict");
    }

    [Fact]
    public void After_24_hours_it_is_expired_and_refuses_accept()
    {
        (Guid id, IActorRef actor) = Created();
        Clock.Advance(TimeSpan.FromHours(24));

        Assert.Equal(InviteStatus.Expired, Assert.IsType<InviteView>(Send(actor, new GetInvite(id))).Status);
        AssertRejected(Send(actor, new AcceptInvite(id, Friend)), "Conflict");
        Assert.Empty(Starter.Started);
    }

    [Fact]
    public void An_unknown_invite_is_not_found() =>
        AssertRejected(Send(Sys.ActorOf(InviteProps(Guid.NewGuid())), new GetInvite(Guid.Empty)), "NotFound");

    [Fact]
    public void An_invalid_colour_or_time_control_is_refused()
    {
        Guid id = Guid.NewGuid();
        IActorRef actor = Sys.ActorOf(InviteProps(id));

        AssertRejected(Send(actor, new CreateInvite(id, Creator, "5+3", "purple")), "Illegal");
        AssertRejected(Send(actor, new CreateInvite(id, Creator, "4+2", "white")), "Illegal");
    }

    [Fact]
    public void A_correspondence_invite_is_open_like_any_other() => Created(tc: "7d");

    [Fact]
    public void An_accepted_invite_survives_a_restart_with_its_game()
    {
        (Guid id, IActorRef actor) = Created();
        Guid? gameId = Assert.IsType<InviteView>(Send(actor, new AcceptInvite(id, Friend))).GameId;

        Watch(actor);
        Sys.Stop(actor);
        ExpectTerminated(actor);
        InviteView recovered = Assert.IsType<InviteView>(Send(Sys.ActorOf(InviteProps(id)), new GetInvite(id)));

        Assert.Equal((InviteStatus.Accepted, gameId), (recovered.Status, recovered.GameId));
    }

    [Fact]
    public void Accepting_publishes_an_invite_frame_with_the_game()
    {
        TestProbe mediator = CreateTestProbe();
        (Guid id, IActorRef actor) = Created(mediator: mediator.Ref);
        mediator.ExpectMsg<Publish>(); // the creation

        InviteView accepted = Assert.IsType<InviteView>(Send(actor, new AcceptInvite(id, Friend)));

        LiveFrame frame = Assert.IsType<LiveFrame>(mediator.ExpectMsg<Publish>().Message);
        Assert.Equal($"invite:{id:N}", frame.Topic);
        Assert.Equal((InviteStatus.Accepted, accepted.GameId), (((InviteView)frame.Payload).Status, ((InviteView)frame.Payload).GameId));
    }

    // Rematch (game-feedback): an invite whose id is the finished game's, reserved for the other player.

    private (Guid Id, IActorRef Actor) Rematch(string creatorColor = "white", string tc = "3+2")
    {
        Guid id = Guid.CreateVersion7();
        IActorRef actor = Sys.ActorOf(InviteProps(id));
        InviteView view = Assert.IsType<InviteView>(Send(actor, new OfferRematch(id, Creator, Friend, tc, creatorColor)));
        Assert.Equal((InviteStatus.Open, Creator, (long?)Friend), (view.Status, view.CreatorId, view.ForId));
        return (id, actor);
    }

    [Fact]
    public void A_reserved_invite_refuses_anyone_but_its_guest()
    {
        (Guid id, IActorRef actor) = Rematch();

        AssertRejected(Send(actor, new AcceptInvite(id, Stranger)), "Forbidden");

        Assert.Empty(Starter.Started);
    }

    [Fact]
    public void The_guests_rematch_offer_accepts_it_with_the_creators_colour()
    {
        (Guid id, IActorRef actor) = Rematch(creatorColor: "black");

        InviteView accepted = Assert.IsType<InviteView>(Send(actor, new OfferRematch(id, Friend, Creator, "3+2", "white")));

        (long white, long black, string tc, Guid gameId) = Assert.Single(Starter.Started);
        Assert.Equal((Friend, Creator, "3+2"), (white, black, tc));
        Assert.Equal((InviteStatus.Accepted, (Guid?)gameId), (accepted.Status, accepted.GameId));
    }

    [Fact]
    public void A_repeated_offer_from_the_creator_changes_nothing()
    {
        (Guid id, IActorRef actor) = Rematch();
        long seq = Assert.IsType<InviteView>(Send(actor, new GetInvite(id))).Seq;

        InviteView again = Assert.IsType<InviteView>(Send(actor, new OfferRematch(id, Creator, Friend, "3+2", "white")));

        Assert.Equal((InviteStatus.Open, seq), (again.Status, again.Seq));
        Assert.Empty(Starter.Started);
    }

    [Fact]
    public void A_stranger_cannot_offer_a_rematch_on_someone_elses_invite()
    {
        (Guid id, IActorRef actor) = Rematch();

        AssertRejected(Send(actor, new OfferRematch(id, Stranger, Creator, "3+2", "white")), "Forbidden");
    }

    [Fact]
    public void A_reserved_invite_keeps_its_guest_after_a_restart()
    {
        (Guid id, IActorRef actor) = Rematch();
        Watch(actor);
        Sys.Stop(actor);
        ExpectTerminated(actor);

        AssertRejected(Send(Sys.ActorOf(InviteProps(id)), new AcceptInvite(id, Stranger)), "Forbidden");
    }
}
