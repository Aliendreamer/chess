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

    private Props InviteProps(Guid id, IActorRef? mediator = null) =>
        Props.Create(() => new InviteActor(id, Starter, mediator, Clock, new Random(7)));

    private object Send(IActorRef actor, object command)
    {
        actor.Tell(command);
        return ExpectMsg<object>();
    }

    private static void AssertRejected(object reply, string code) =>
        Assert.Equal(code, Assert.IsType<InviteRejected>(reply).Code.ToString());

    // Rematch (game-feedback) is the only way an invite is made: its id is the finished game's, reserved for the
    // other player. Invite links (create/accept/cancel by id) are gone.

    private (Guid Id, IActorRef Actor) Rematch(string creatorColor = "white", string tc = "3+2", IActorRef? mediator = null)
    {
        Guid id = Guid.CreateVersion7();
        IActorRef actor = Sys.ActorOf(InviteProps(id, mediator));
        InviteView view = Assert.IsType<InviteView>(Send(actor, new OfferRematch(id, Creator, Friend, tc, creatorColor)));
        Assert.Equal((InviteStatus.Open, Creator, (long?)Friend), (view.Status, view.CreatorId, view.ForId));
        return (id, actor);
    }

    private object Accept(IActorRef actor, Guid id) => Send(actor, new OfferRematch(id, Friend, Creator, "3+2", "white"));

    [Fact]
    public void An_offered_rematch_is_open_for_24_hours()
    {
        (Guid id, IActorRef actor) = Rematch(creatorColor: "black", tc: "10+5");

        InviteView view = Assert.IsType<InviteView>(Send(actor, new GetInvite(id)));

        Assert.Equal((Creator, "10+5", "black", InviteStatus.Open, (Guid?)null), (view.CreatorId, view.TimeControl, view.Color, view.Status, view.GameId));
        Assert.Equal(Time.Utc("2026-09-27T10:00:00Z"), view.ExpiresAt);
    }

    [Fact]
    public void The_guests_rematch_offer_accepts_it_with_the_creators_colour()
    {
        (Guid id, IActorRef actor) = Rematch(creatorColor: "black");

        InviteView accepted = Assert.IsType<InviteView>(Accept(actor, id));

        (long white, long black, string tc, Guid gameId) = Assert.Single(Starter.Started);
        Assert.Equal((Friend, Creator, "3+2"), (white, black, tc)); // the creator is on black, so the guest is White
        Assert.Equal((InviteStatus.Accepted, (Guid?)gameId), (accepted.Status, accepted.GameId));
    }

    [Fact]
    public void A_white_rematch_makes_the_creator_white()
    {
        (Guid id, IActorRef actor) = Rematch(creatorColor: "white");
        Accept(actor, id);

        Assert.Equal((Creator, Friend), (Starter.Started[^1].White, Starter.Started[^1].Black));
    }

    [Fact]
    public void A_second_accept_is_a_conflict_and_starts_nothing()
    {
        (Guid id, IActorRef actor) = Rematch();
        Accept(actor, id);

        AssertRejected(Accept(actor, id), "Conflict");

        Assert.Single(Starter.Started);
    }

    [Fact]
    public void Two_accepts_sent_back_to_back_start_one_game()
    {
        (Guid id, IActorRef actor) = Rematch();

        actor.Tell(new OfferRematch(id, Friend, Creator, "3+2", "white"));
        actor.Tell(new OfferRematch(id, Friend, Creator, "3+2", "white")); // arrives while the first start is in flight
        object first = ExpectMsg<object>();
        object second = ExpectMsg<object>();

        Assert.IsType<InviteView>(first);
        AssertRejected(second, "Conflict");
        Assert.Single(Starter.Started);
    }

    [Fact]
    public void After_24_hours_it_is_expired_and_refuses_accept()
    {
        (Guid id, IActorRef actor) = Rematch();
        Clock.Advance(TimeSpan.FromHours(24));

        Assert.Equal(InviteStatus.Expired, Assert.IsType<InviteView>(Send(actor, new GetInvite(id))).Status);
        AssertRejected(Accept(actor, id), "Conflict");
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

        AssertRejected(Send(actor, new OfferRematch(id, Creator, Friend, "5+3", "purple")), "Illegal");
        AssertRejected(Send(actor, new OfferRematch(id, Creator, Friend, "4+2", "white")), "Illegal");
        AssertRejected(Send(actor, new OfferRematch(id, Creator, Friend, "7d", "white")), "Illegal"); // no correspondence games
    }

    [Fact]
    public void An_accepted_rematch_survives_a_restart_with_its_game()
    {
        (Guid id, IActorRef actor) = Rematch();
        Guid? gameId = Assert.IsType<InviteView>(Accept(actor, id)).GameId;

        Watch(actor);
        Sys.Stop(actor);
        ExpectTerminated(actor);
        InviteView recovered = Assert.IsType<InviteView>(Send(Sys.ActorOf(InviteProps(id)), new GetInvite(id)));

        Assert.Equal((InviteStatus.Accepted, gameId), (recovered.Status, recovered.GameId));
    }

    [Fact]
    public void Offering_and_accepting_publish_invite_frames_with_the_game()
    {
        TestProbe mediator = CreateTestProbe();
        (Guid id, IActorRef actor) = Rematch(mediator: mediator.Ref);
        Assert.Equal(InviteStatus.Open, ((InviteView)((LiveFrame)mediator.ExpectMsg<Publish>().Message).Payload).Status);

        InviteView accepted = Assert.IsType<InviteView>(Accept(actor, id));

        LiveFrame frame = Assert.IsType<LiveFrame>(mediator.ExpectMsg<Publish>().Message);
        Assert.Equal($"invite:{id:N}", frame.Topic);
        Assert.Equal((InviteStatus.Accepted, accepted.GameId), (((InviteView)frame.Payload).Status, ((InviteView)frame.Payload).GameId));
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

        Assert.Empty(Starter.Started);
    }

    [Fact]
    public void A_reserved_invite_keeps_its_guest_after_a_restart()
    {
        (Guid id, IActorRef actor) = Rematch();
        Watch(actor);
        Sys.Stop(actor);
        ExpectTerminated(actor);

        AssertRejected(Send(Sys.ActorOf(InviteProps(id)), new OfferRematch(id, Stranger, Creator, "3+2", "white")), "Forbidden");
    }
}
