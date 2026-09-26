using Akka.Actor;
using Akka.Hosting;
using Akka.Persistence.Journal;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Outbox;
using Chess.Backend.Events;
using Chess.Backend.Games;
using Chess.Backend.Live;

namespace Chess.Backend.Tests.Games;

public sealed class GameMapperTests
{
    private static readonly DateTimeOffset At = new(2026, 9, 26, 10, 0, 0, TimeSpan.Zero);
    private const string Id = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f";

    private static JournalEventMappers Registry() => new(GameJournalMappers.All());

    public static TheoryData<object, string> Events() => new()
    {
        { new GameCreated(1, 2, "5+3", 300_000, 3_000, At), "game.created" },
        { new MoveMade(1, "e2e4", "e4", "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", 300_000, 300_000, At), "game.move-made" },
        { new DrawOffered(1, At), "game.draw-offered" },
        { new DrawDeclined(2, At), "game.draw-declined" },
        { new GameEnded("0-1", "Checkmate", 250_000, 260_000, At), "game.ended" },
    };

    [Theory]
    [MemberData(nameof(Events))]
    public void Every_game_event_maps_to_game_events_keyed_by_game(object evt, string type)
    {
        OutboxRecord r = Registry().Map($"game-{Id}", 7, evt);

        Assert.Equal(("game.events", $"game:{Id}"), (r.Topic, r.Key));
        Assert.True(EventJson.TryDeserialize(r.Json, out EventEnvelope<System.Text.Json.JsonElement>? e));
        Assert.Equal((type, 1, Id, 7L, At), (e.Type, e.V, e.AggregateId, e.Seq, e.At));
    }

    [Fact]
    public void The_move_payload_carries_the_record_fields()
    {
        MoveMade move = new(3, "g1f3", "Nf3", "fen", 290_000, 295_000, At);
        OutboxRecord r = Registry().Map($"game-{Id}", 4, move);

        Assert.True(EventJson.TryDeserialize(r.Json, out EventEnvelope<MoveMade>? e));
        Assert.Equal(move, e.Payload);
    }

    [Fact]
    public void A_game_event_under_a_foreign_persistence_id_is_refused() =>
        Assert.Throws<InvalidOperationException>(() => Registry().Map("ping-abc", 1, new DrawOffered(1, At)));

    [Theory]
    [MemberData(nameof(Events))]
    public void The_tagger_binds_and_tags_every_game_event_for_game_events(object evt, string type)
    {
        Assert.NotNull(type);
        Assert.Contains(evt.GetType(), TopicTagger.BoundTypes);
        Tagged tagged = Assert.IsType<Tagged>(new TopicTagger().ToJournal(evt));
        Assert.Equal(["game.events"], tagged.Tags);
    }
}

public sealed class GameLiveSourceTests : TestKit
{
    private sealed class Region(IActorRef actorRef) : IRequiredActor<GameActor>
    {
        public IActorRef ActorRef { get; } = actorRef;

        public Task<IActorRef> GetAsync(CancellationToken cancellationToken = default) => Task.FromResult(ActorRef);
    }

    [Theory]
    [InlineData("0199f1c2a3b47c5d8e9f0a1b2c3d4e5f", true)]
    [InlineData("0199F1C2A3B47C5D8E9F0A1B2C3D4E5F", false)] // N form is lower case
    [InlineData("0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f", false)] // D form
    [InlineData("not-a-guid", false)]
    [InlineData("", false)]
    public void Accepts_only_n_form_guids(string id, bool valid) =>
        Assert.Equal(valid, new GameLiveSource(new Region(CreateTestProbe().Ref)).IsValidId(id));

    [Fact]
    public async Task The_snapshot_is_the_games_view_as_a_frame_with_its_seq()
    {
        TestProbe region = CreateTestProbe();
        Guid id = Guid.CreateVersion7();
        GameView view = new(id, 1, 2, "5+3", GameStatus.Playing, "fen", 3, "Black", "g1f3", "Nf3", 1, 2, DateTimeOffset.UnixEpoch, null, null, null, 9);

        Task<LiveFrame?> snapshot = new GameLiveSource(new Region(region.Ref)).SnapshotAsync(id.ToString("N"), CancellationToken.None);
        Assert.Equal(id, region.ExpectMsg<GetGameView>().GameId);
        region.Reply(view);

        LiveFrame frame = (await snapshot)!;
        Assert.Equal(($"game:{id:N}", 9L), (frame.Topic, frame.Seq));
        Assert.Same(view, frame.Payload);
    }

    [Fact]
    public async Task An_unknown_game_has_no_snapshot()
    {
        TestProbe region = CreateTestProbe();
        Guid id = Guid.CreateVersion7();

        Task<LiveFrame?> snapshot = new GameLiveSource(new Region(region.Ref)).SnapshotAsync(id.ToString("N"), CancellationToken.None);
        region.ExpectMsg<GetGameView>();
        region.Reply(new GameRejected(id, RejectionCode.NotFound, "No such game."));

        Assert.Null(await snapshot);
    }
}

public sealed class GameShardingTests
{
    [Fact]
    public void The_games_region_never_idle_passivates()
    {
        // Akka's default is 120 s: a classical game with a long think would lose its clock timers (design D8).
        Assert.Equal(TimeSpan.Zero, GameShardingExtensions.ShardOptions().PassivateIdleEntityAfter);
    }

    [Fact]
    public void Commands_route_by_game_id_in_n_form()
    {
        Guid id = Guid.CreateVersion7();
        GameMessageExtractor x = new(50);

        Assert.Equal(id.ToString("N"), x.EntityId(new MakeMove(id, 1, "e2e4")));
        Assert.Equal(id.ToString("N"), x.EntityId(new GetGameView(id)));
        Assert.Null(x.EntityId("not a command"));
    }
}
