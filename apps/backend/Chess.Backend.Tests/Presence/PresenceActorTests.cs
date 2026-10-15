using Akka.Actor;
using Akka.Cluster.Tools.PublishSubscribe;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Presence;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Messaging;

namespace Chess.Backend.Tests.Presence;

/// <summary>The presence singleton (club-members D1, D2): leases, playing, challenge reservations and the frames.</summary>
public sealed class PresenceActorTests() : TestKit(AkkaConfig.InMemoryPersistenceWithTestScheduler)
{
    private const long Ann = 1;
    private const long Bob = 2;
    private const long Cid = 3;
    private static readonly TimeSpan Lease = TimeSpan.FromSeconds(75);
    private static readonly TimeSpan SweepEvery = TimeSpan.FromSeconds(5);

    private FakeClock Clock { get; } = new(Time.Utc("2026-10-13T10:00:00Z"));

    private FakeDirectory Directory { get; } = new();

    private sealed class FakeDirectory : IMemberDirectory
    {
        public List<LiveGame> Games { get; } = [];

        public List<(long User, DateTimeOffset At)> Seen { get; } = [];

        public Task<IReadOnlyList<MemberRow>> ActiveMembersAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<MemberRow>>([new(Ann, "ann", null), new(Bob, "bob", null), new(Cid, "cid", null)]);

        public Task MarkLastSeenAsync(long userId, DateTimeOffset at, CancellationToken ct)
        {
            lock (Seen)
            {
                Seen.Add((userId, at));
            }

            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<LiveGame>> LiveGamesAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<LiveGame>>([.. Games]);
    }

    private (IActorRef Presence, TestProbe Mediator) Start()
    {
        TestProbe mediator = CreateTestProbe();
        IActorRef presence = Sys.ActorOf(Props.Create(() => new PresenceActor(Directory, mediator.Ref, Clock, Lease, SweepEvery)));
        mediator.ExpectMsg<Subscribe>(s => Assert.Equal(PresenceTopics.PubSub, s.Topic));
        return (presence, mediator);
    }

    private void Advance(TimeSpan by)
    {
        Clock.Advance(by);
        ((TestScheduler)Sys.Scheduler).Advance(by);
    }

    private static T Payload<T>(TestProbe mediator, string topic)
    {
        LiveFrame frame = Assert.IsType<LiveFrame>(mediator.ExpectMsg<Publish>().Message);
        Assert.Equal(topic, frame.Topic);
        return Assert.IsType<T>(frame.Payload);
    }

    private PresenceSnapshot Presence(IActorRef presence)
    {
        presence.Tell(GetPresence.Instance);
        return ExpectMsg<PresenceSnapshot>();
    }

    private object Reserve(IActorRef presence, Guid id, long from, long to)
    {
        presence.Tell(new TryReserveChallenge(id, from, "ann", to, "5+3", "white"));
        return ExpectMsg<object>();
    }

    [Fact]
    public void A_member_with_a_page_open_is_online_and_the_members_frame_says_so()
    {
        (IActorRef presence, TestProbe mediator) = Start();

        presence.Tell(new ReportUserPresence(Bob, "bff-1", Present: true));

        MembersView view = Payload<MembersView>(mediator, "members:all");
        Assert.True(view.PresenceKnown);
        Assert.Equal([("bob", MemberState.Online), ("ann", MemberState.Offline), ("cid", MemberState.Offline)], view.Items.Select(i => (i.Username, i.State)));
        Assert.Equal(MemberState.Online, Presence(presence).States[Bob]);
    }

    [Fact]
    public void A_refresh_publishes_nothing_and_the_last_page_closing_records_when_they_were_seen()
    {
        (IActorRef presence, TestProbe mediator) = Start();
        presence.Tell(new ReportUserPresence(Bob, "bff-1", Present: true));
        presence.Tell(new ReportUserPresence(Bob, "bff-2", Present: true));
        long first = Assert.IsType<LiveFrame>(mediator.ExpectMsg<Publish>().Message).Seq;

        presence.Tell(new ReportUserPresence(Bob, "bff-1", Present: false)); // still open on another BFF
        mediator.ExpectNoMsg(TimeSpan.FromMilliseconds(200));
        Clock.Advance(TimeSpan.FromSeconds(10));
        presence.Tell(new ReportUserPresence(Bob, "bff-2", Present: false));

        LiveFrame frame = Assert.IsType<LiveFrame>(mediator.ExpectMsg<Publish>().Message);
        MemberItem bob = Assert.IsType<MembersView>(frame.Payload).Items.Single(i => i.Id == Bob);
        Assert.Equal((MemberState.Offline, (DateTimeOffset?)Clock.Now), (bob.State, bob.LastSeenAt));
        Assert.True(frame.Seq > first);
        AwaitAssert(() => Assert.Equal([(Bob, Clock.Now)], Directory.Seen));
    }

    [Fact]
    public void A_lease_nobody_refreshes_runs_out_and_the_member_was_last_seen_at_their_last_report()
    {
        (IActorRef presence, TestProbe mediator) = Start();
        DateTimeOffset reported = Clock.Now;
        presence.Tell(new ReportUserPresence(Bob, "bff-1", Present: true));
        Payload<MembersView>(mediator, "members:all");

        Advance(Lease + SweepEvery);

        MemberItem bob = Payload<MembersView>(mediator, "members:all").Items.Single(i => i.Id == Bob);
        Assert.Equal((MemberState.Offline, (DateTimeOffset?)reported), (bob.State, bob.LastSeenAt));
    }

    [Fact]
    public void A_game_between_people_makes_both_playing_until_it_ends()
    {
        (IActorRef presence, TestProbe mediator) = Start();
        presence.Tell(new ReportUserPresence(Ann, "bff-1", Present: true));
        Payload<MembersView>(mediator, "members:all");
        Guid game = Guid.CreateVersion7();

        presence.Tell(new PlayerGameStarted(game, Ann, Bob));
        Assert.Equal(
            [(Ann, MemberState.Playing), (Bob, MemberState.Playing)],
            Payload<MembersView>(mediator, "members:all").Items.Where(i => i.State != MemberState.Offline).Select(i => (i.Id, i.State)).Order());

        presence.Tell(new PlayerGameEnded(game, Ann, Bob));
        PresenceSnapshot after = AwaitPresence(presence, s => !s.States.ContainsKey(Bob));
        Assert.Equal(MemberState.Online, after.States[Ann]);
    }

    [Fact]
    public void After_a_failover_the_games_still_being_played_make_their_players_playing()
    {
        Directory.Games.Add(new LiveGame(Guid.CreateVersion7(), Ann, Bob));

        (IActorRef presence, _) = Start();

        Assert.Equal(MemberState.Playing, AwaitPresence(presence, s => s.States.ContainsKey(Bob)).States[Bob]);
    }

    [Fact]
    public void A_challenge_needs_an_opponent_who_is_online_free_and_unchallenged_and_a_challenger_with_none_out()
    {
        (IActorRef presence, TestProbe mediator) = Start();

        Assert.Equal(ChallengeRefusal.Self, Assert.IsType<ChallengeRefused>(Reserve(presence, Guid.NewGuid(), Ann, Ann)).Reason);
        Assert.Equal(ChallengeRefusal.Offline, Assert.IsType<ChallengeRefused>(Reserve(presence, Guid.NewGuid(), Ann, Bob)).Reason);

        presence.Tell(new ReportUserPresence(Bob, "bff-1", Present: true));
        presence.Tell(new ReportUserPresence(Cid, "bff-1", Present: true));
        Guid first = Guid.NewGuid();
        Assert.IsType<ChallengeReserved>(Reserve(presence, first, Ann, Bob));
        Assert.Equal(ChallengeRefusal.ChallengeOut, Assert.IsType<ChallengeRefused>(Reserve(presence, Guid.NewGuid(), Ann, Cid)).Reason);
        Assert.Equal(ChallengeRefusal.AlreadyChallenged, Assert.IsType<ChallengeRefused>(Reserve(presence, Guid.NewGuid(), Cid, Bob)).Reason);

        presence.Tell(new PlayerGameStarted(Guid.CreateVersion7(), Cid, 9));
        Assert.Equal(ChallengeRefusal.Playing, Assert.IsType<ChallengeRefused>(Reserve(presence, Guid.NewGuid(), Bob, Cid)).Reason);
        mediator.ReceiveWhile(TimeSpan.FromMilliseconds(200), m => m);

        presence.Tell(new ReleaseChallenge(first));
        Assert.IsType<ChallengeReserved>(Reserve(presence, Guid.NewGuid(), Ann, Bob));
    }

    [Fact]
    public void An_opened_challenge_shows_on_the_opponents_topic_until_it_is_released()
    {
        (IActorRef presence, TestProbe mediator) = Start();
        presence.Tell(new ReportUserPresence(Bob, "bff-1", Present: true));
        Payload<MembersView>(mediator, "members:all");
        Guid id = Guid.NewGuid();
        Reserve(presence, id, Ann, Bob);

        presence.Tell(new GetUserView(Bob));
        Assert.Empty(ExpectMsg<UserView>().Challenges); // reserved, but no invite yet

        DateTimeOffset expires = Clock.Now.AddSeconds(60);
        presence.Tell(new ChallengeOpened(id, expires));
        UserView open = Payload<UserView>(mediator, "user:2");
        ChallengeItem item = Assert.Single(open.Challenges);
        Assert.Equal((id, Ann, "ann", "5+3", "white", expires), (item.InviteId, item.FromId, item.From, item.TimeControl, item.Color, item.ExpiresAt));

        presence.Tell(new ReleaseChallenge(id));
        UserView released = Payload<UserView>(mediator, "user:2");
        Assert.Empty(released.Challenges);
        Assert.True(released.Seq > open.Seq);
    }

    [Fact]
    public void A_challenge_nobody_ended_goes_after_it_ran_out()
    {
        (IActorRef presence, TestProbe mediator) = Start();
        presence.Tell(new ReportUserPresence(Bob, "bff-1", Present: true));
        Guid id = Guid.NewGuid();
        Reserve(presence, id, Ann, Bob);
        presence.Tell(new ChallengeOpened(id, Clock.Now.AddSeconds(60)));
        presence.Tell(new ReportUserPresence(Bob, "bff-1", Present: true)); // keeps Bob online through the minute
        mediator.ReceiveWhile(TimeSpan.FromMilliseconds(200), m => m);

        Advance(TimeSpan.FromSeconds(60) + PresenceActor.ExpiredGrace + SweepEvery);

        Publish expired = (Publish)mediator.FishForMessage(m => m is Publish { Message: LiveFrame { Topic: "user:2" } });
        Assert.Empty(Assert.IsType<UserView>(((LiveFrame)expired.Message).Payload).Challenges);
    }

    [Fact]
    public void Dropping_a_member_ends_their_challenges_and_their_presence()
    {
        (IActorRef presence, TestProbe mediator) = Start();
        presence.Tell(new ReportUserPresence(Bob, "bff-1", Present: true));
        presence.Tell(new ReportUserPresence(Ann, "bff-1", Present: true));
        Guid toBob = Guid.NewGuid();
        Reserve(presence, toBob, Ann, Bob);
        mediator.ReceiveWhile(TimeSpan.FromMilliseconds(200), m => m);

        presence.Tell(new DropMember(Ann));

        Assert.Equal([toBob], ExpectMsg<MemberDropped>().Challenges);
        Assert.False(Presence(presence).States.ContainsKey(Ann));
        Assert.IsType<ChallengeReserved>(Reserve(presence, Guid.NewGuid(), Cid, Bob));
    }

    [Fact]
    public void A_changed_list_is_published_again_on_request()
    {
        (IActorRef presence, TestProbe mediator) = Start();

        presence.Tell(RefreshMembers.Instance);

        Assert.Equal(3, Payload<MembersView>(mediator, "members:all").Items.Count);
    }

    private PresenceSnapshot AwaitPresence(IActorRef presence, Func<PresenceSnapshot, bool> done)
    {
        PresenceSnapshot last = Presence(presence);
        AwaitCondition(() => done(last = Presence(presence)), TimeSpan.FromSeconds(3));
        return last;
    }
}
