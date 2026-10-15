using Akka.Actor;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Akka.Presence;
using Chess.Backend.Events;
using Chess.Backend.Games;
using Chess.Backend.Messaging;

namespace Chess.Backend.Tests.Matchmaking;

/// <summary>
/// A challenge is an invite reserved for one member, open 60 s (club-members D2): accepted by that member only,
/// declined by them, cancelled by the challenger, expired by its timer, and every end releases it in presence.
/// </summary>
public sealed class ChallengeTests() : TestKit(AkkaConfig.InMemoryPersistenceWithTestScheduler)
{
    private const long Ann = 1;
    private const long Bob = 2;
    private const long Cid = 3;

    private FakeClock Clock { get; } = new(Time.Utc("2026-10-13T10:00:00Z"));

    private sealed class FakeStarter : IGameStarter
    {
        public List<(long White, long Black, string Tc)> Started { get; } = [];

        public Task<GameView> StartAsync(long whiteId, long blackId, TimeControl timeControl, CancellationToken ct, EnginePlayer? engine = null)
        {
            lock (Started)
            {
                Started.Add((whiteId, blackId, timeControl.ToString()));
            }

            return Task.FromResult(new GameView(Guid.CreateVersion7(), whiteId, blackId, timeControl.ToString(), GameStatus.Created, "fen", 0, Side.White, null, null, 0, 0, DateTimeOffset.UnixEpoch, null, null, null, 1));
        }
    }

    private FakeStarter Starter { get; } = new();

    private TestProbe PresenceProbe { get; set; } = null!;

    private Props InviteProps(Guid id, IActorRef? mediator = null) =>
        Props.Create(() => new InviteActor(id, Starter, mediator, Clock, new Random(7), PresenceProbe.Ref));

    private (Guid Id, IActorRef Actor) Challenge(string color = "white", IActorRef? mediator = null)
    {
        PresenceProbe = CreateTestProbe();
        Guid id = Guid.CreateVersion7();
        IActorRef actor = Sys.ActorOf(InviteProps(id, mediator));
        InviteView view = Assert.IsType<InviteView>(Send(actor, new OfferChallenge(id, Ann, Bob, "5+3", color)));
        Assert.Equal((InviteKind.Challenge, InviteStatus.Open, Ann, (long?)Bob), (view.Kind, view.Status, view.CreatorId, view.ForId));
        Assert.Equal(new ChallengeOpened(id, Clock.Now + Backend.Akka.Matchmaking.Challenge.Lifetime), PresenceProbe.ExpectMsg<ChallengeOpened>());
        return (id, actor);
    }

    private object Send(IActorRef actor, object command)
    {
        actor.Tell(command);
        return ExpectMsg<object>();
    }

    private static void AssertRejected(object reply, string code) =>
        Assert.Equal(code, Assert.IsType<InviteRejected>(reply).Code.ToString());

    private void Advance(TimeSpan by)
    {
        Clock.Advance(by);
        ((TestScheduler)Sys.Scheduler).Advance(by);
    }

    [Fact]
    public void A_challenge_is_open_for_a_minute()
    {
        (Guid id, IActorRef actor) = Challenge();

        InviteView view = Assert.IsType<InviteView>(Send(actor, new GetInvite(id)));

        Assert.Equal(Clock.Now.AddSeconds(60), view.ExpiresAt);
    }

    [Fact]
    public void The_challenged_member_accepts_and_the_game_starts_with_the_challengers_colour()
    {
        (Guid id, IActorRef actor) = Challenge(color: "black");

        InviteView accepted = Assert.IsType<InviteView>(Send(actor, new AcceptChallenge(id, Bob)));

        Assert.Equal((InviteStatus.Accepted, true), (accepted.Status, accepted.GameId is not null));
        Assert.Equal((Bob, Ann, "5+3"), Assert.Single(Starter.Started));
        PresenceProbe.ExpectMsg<ReleaseChallenge>(r => Assert.Equal(id, r.InviteId));
    }

    [Fact]
    public void Only_the_challenged_member_may_answer_and_only_the_challenger_may_cancel()
    {
        (Guid id, IActorRef actor) = Challenge();

        AssertRejected(Send(actor, new AcceptChallenge(id, Cid)), "Forbidden");
        AssertRejected(Send(actor, new AcceptChallenge(id, Ann)), "Forbidden");
        AssertRejected(Send(actor, new DeclineChallenge(id, Cid)), "Forbidden");
        AssertRejected(Send(actor, new CancelChallenge(id, Bob)), "Forbidden");

        Assert.Empty(Starter.Started);
        PresenceProbe.ExpectNoMsg(TimeSpan.FromMilliseconds(100));
    }

    [Fact]
    public void A_declined_challenge_is_declined_for_good()
    {
        TestProbe mediator = CreateTestProbe();
        (Guid id, IActorRef actor) = Challenge(mediator: mediator.Ref);
        mediator.ExpectMsg<Publish>();

        InviteView declined = Assert.IsType<InviteView>(Send(actor, new DeclineChallenge(id, Bob)));

        Assert.Equal(InviteStatus.Declined, declined.Status);
        Assert.Equal(declined, ((LiveFrame)mediator.ExpectMsg<Publish>().Message).Payload);
        PresenceProbe.ExpectMsg<ReleaseChallenge>();
        AssertRejected(Send(actor, new AcceptChallenge(id, Bob)), "Conflict");
        Assert.Empty(Starter.Started);
    }

    [Fact]
    public void The_challenger_may_withdraw_it_and_so_may_the_club()
    {
        (Guid id, IActorRef actor) = Challenge();
        Assert.Equal(InviteStatus.Cancelled, Assert.IsType<InviteView>(Send(actor, new CancelChallenge(id, Ann))).Status);
        PresenceProbe.ExpectMsg<ReleaseChallenge>();

        (Guid other, IActorRef second) = Challenge();
        Assert.Equal(InviteStatus.Cancelled, Assert.IsType<InviteView>(Send(second, new CancelChallenge(other, null))).Status);
        Assert.Equal(InviteStatus.Cancelled, Assert.IsType<InviteView>(Send(second, new CancelChallenge(other, null))).Status); // again: reads back
    }

    [Fact]
    public void An_unanswered_challenge_expires_by_its_timer_with_a_frame_of_its_own()
    {
        TestProbe mediator = CreateTestProbe();
        (Guid id, IActorRef actor) = Challenge(mediator: mediator.Ref);
        long openSeq = ((LiveFrame)mediator.ExpectMsg<Publish>().Message).Seq;

        Advance(TimeSpan.FromSeconds(61));

        LiveFrame frame = Assert.IsType<LiveFrame>(mediator.ExpectMsg<Publish>().Message);
        Assert.Equal(InviteStatus.Expired, Assert.IsType<InviteView>(frame.Payload).Status);
        Assert.True(frame.Seq > openSeq);
        PresenceProbe.ExpectMsg<ReleaseChallenge>(r => Assert.Equal(id, r.InviteId));
        AssertRejected(Send(actor, new AcceptChallenge(id, Bob)), "Conflict");
    }

    [Fact]
    public void A_challenge_recovers_as_a_challenge_and_a_rematch_command_cannot_touch_it()
    {
        (Guid id, IActorRef actor) = Challenge();
        Watch(actor);
        actor.Tell(PoisonPill.Instance);
        ExpectTerminated(actor);

        IActorRef recovered = Sys.ActorOf(InviteProps(id));
        InviteView view = Assert.IsType<InviteView>(Send(recovered, new GetInvite(id)));

        Assert.Equal((InviteKind.Challenge, InviteStatus.Open, Clock.Now.AddSeconds(60)), (view.Kind, view.Status, view.ExpiresAt));
        AssertRejected(Send(recovered, new OfferRematch(id, Bob, Ann, "5+3", "white")), "NotFound");
    }

    [Fact]
    public void Answering_an_unknown_challenge_or_a_rematch_is_not_found()
    {
        PresenceProbe = CreateTestProbe();
        Guid id = Guid.CreateVersion7();
        IActorRef actor = Sys.ActorOf(InviteProps(id));
        AssertRejected(Send(actor, new AcceptChallenge(id, Bob)), "NotFound");

        Send(actor, new OfferRematch(id, Ann, Bob, "5+3", "white"));
        AssertRejected(Send(actor, new DeclineChallenge(id, Bob)), "NotFound");
    }

    [Fact]
    public void Challenge_events_keep_their_fields_in_the_journal()
    {
        DateTimeOffset at = Clock.Now;
        Assert.Equal(new InviteCreated(Ann, "5+3", "random", at, Bob, Kind: "challenge", LifetimeSeconds: 60), RoundTrip(new InviteCreated(Ann, "5+3", "random", at, Bob, Kind: "challenge", LifetimeSeconds: 60)));
        Assert.Equal(new InviteDeclined(Bob, at), RoundTrip(new InviteDeclined(Bob, at)));
        Assert.Equal(new InviteExpired(at), RoundTrip(new InviteExpired(at)));
    }

    [Fact]
    public void Kind_and_the_new_status_are_lower_case_on_the_wire()
    {
        InviteView view = new(Guid.Empty, Ann, "5+3", "white", InviteStatus.Declined, null, Clock.Now, Clock.Now, 3, Bob, InviteKind.Challenge);

        string json = System.Text.Json.JsonSerializer.Serialize(view, System.Text.Json.JsonSerializerOptions.Web);

        Assert.Contains("\"status\":\"declined\"", json, StringComparison.Ordinal);
        Assert.Contains("\"kind\":\"challenge\"", json, StringComparison.Ordinal);
    }

    private T RoundTrip<T>(T evt)
        where T : notnull
    {
        global::Akka.Serialization.Serializer serializer = Sys.Serialization.FindSerializerFor(evt);
        return (T)Sys.Serialization.Deserialize(serializer.ToBinary(evt), serializer.Identifier, string.Empty);
    }
}
