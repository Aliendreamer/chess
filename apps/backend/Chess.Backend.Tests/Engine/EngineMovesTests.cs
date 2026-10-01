using System.Text.Json;
using Akka.Actor;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Games;
using Chess.Backend.Engine;
using Chess.Backend.Events;
using Chess.Backend.Extensions;
using Chess.Backend.Games;
using Chess.Backend.Projections;

namespace Chess.Backend.Tests.Engine;

/// <summary>Records what would have been produced to <c>engine.moves.requests</c>.</summary>
internal sealed class RecordingEngineRequests : IEngineRequests
{
    public List<(Guid GameId, int Ply, string Fen, string Level, bool Nudge)> Sent { get; } = [];

    public Task RequestAsync(Guid gameId, int ply, string fen, string level, CancellationToken ct)
    {
        Sent.Add((gameId, ply, fen, level, false));
        return Task.CompletedTask;
    }

    public void Nudge(Guid gameId, int ply, string fen, string level) => Sent.Add((gameId, ply, fen, level, true));
}

public sealed class EngineRequestConsumerTests
{
    private static readonly DateTimeOffset T0 = Time.Utc("2026-09-27T10:00:00Z");
    private static readonly Guid Game = Guid.Parse("0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f");
    private const string AfterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    private const string AfterE5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";

    private static string Env<T>(string type, long seq, T payload) =>
        EventJson.Serialize(new EventEnvelope<T>(type, 1, Game.ToString("N"), seq, T0.AddSeconds(seq), payload));

    private static string Created(EnginePlayer? engine) =>
        Env("game.created", 1, new GameCreated(11, -2, "untimed", 0, 0, T0, engine));

    private static string Moved(long seq, int ply, string uci, string fen) =>
        Env("game.move-made", seq, new MoveMade(ply, uci, uci, fen, 0, 0, T0));

    private static string Ended(long seq) => Env("game.ended", seq, new GameEnded("1-0", "Resignation", 0, 0, T0));

    private static (ProjectDbContext Db, EngineRequestConsumer Consumer, RecordingEngineRequests Requests) Build()
    {
        ProjectDbContext db = TestDb.Create();
        RecordingEngineRequests requests = new();
        return (db, new EngineRequestConsumer(db, requests, NullLogger<EngineRequestConsumer>.Instance), requests);
    }

    private static async Task ApplyAll(EngineRequestConsumer consumer, params string[] events)
    {
        foreach (string e in events)
        {
            await consumer.ApplyAsync(Game.ToString("N"), e, CancellationToken.None);
        }
    }

    [Fact]
    public async Task A_game_between_people_asks_nothing_and_keeps_no_row()
    {
        (ProjectDbContext db, EngineRequestConsumer consumer, RecordingEngineRequests requests) = Build();
        using (db)
        {
            await ApplyAll(consumer, Created(null), Moved(2, 1, "e2e4", AfterE4));

            Assert.Empty(requests.Sent);
            Assert.Equal(0, await db.EngineGames.CountAsync());
        }
    }

    [Fact]
    public async Task The_engine_as_black_is_asked_after_each_human_move_only()
    {
        (ProjectDbContext db, EngineRequestConsumer consumer, RecordingEngineRequests requests) = Build();
        using (db)
        {
            await ApplyAll(consumer, Created(new EnginePlayer("black", "1600")), Moved(2, 1, "e2e4", AfterE4), Moved(3, 2, "e7e5", AfterE5));

            Assert.Equal([(Game, 1, AfterE4, "1600", false)], requests.Sent);
            Assert.Equal(3, (await db.EngineGames.SingleAsync()).LastSeq);
        }
    }

    [Fact]
    public async Task The_engine_as_white_is_asked_for_the_first_move_at_creation()
    {
        (ProjectDbContext db, EngineRequestConsumer consumer, RecordingEngineRequests requests) = Build();
        using (db)
        {
            await ApplyAll(consumer, Created(new EnginePlayer("white", "max")));

            Assert.Equal([(Game, 0, ChessRules.StartFen, "max", false)], requests.Sent);
        }
    }

    [Fact]
    public async Task A_replayed_event_asks_nothing_twice_even_after_the_end()
    {
        (ProjectDbContext db, EngineRequestConsumer consumer, RecordingEngineRequests requests) = Build();
        using (db)
        {
            string[] all = [Created(new EnginePlayer("white", "2000")), Moved(2, 1, "e2e4", AfterE4), Moved(3, 2, "e7e5", AfterE5), Ended(4)];
            await ApplyAll(consumer, all);
            await ApplyAll(consumer, all);

            Assert.Equal(2, requests.Sent.Count); // creation (engine as White) and after 1…e5
            Assert.True((await db.EngineGames.SingleAsync()).Ended);
        }
    }

    [Fact]
    public async Task A_gap_stalls_like_any_projection()
    {
        (ProjectDbContext db, EngineRequestConsumer consumer, _) = Build();
        using (db)
        {
            await ApplyAll(consumer, Created(new EnginePlayer("black", "1600")));

            await Assert.ThrowsAsync<ProjectionGapException>(() => ApplyAll(consumer, Moved(3, 2, "e7e5", AfterE5)));
        }
    }

    [Theory]
    [InlineData(AfterE4, "black")]
    [InlineData(AfterE5, "white")]
    [InlineData("not a fen", "white")]
    public void The_side_to_move_is_the_fens_second_field(string fen, string side) =>
        Assert.Equal(side, EngineRequestConsumer.SideToMove(fen));
}

public sealed class EngineMoveConsumerTests : TestKit
{
    private static readonly Guid Game = Guid.Parse("0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f");

    private EngineMoveConsumer Consumer(TestProbe region) =>
        new(new FixedRegion<GameActor>(region.Ref), Options.Create(new ApiOptions()), NullLogger<EngineMoveConsumer>.Instance);

    private static string Result(string level = "1600", string gameId = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f") =>
        JsonSerializer.Serialize(new EngineMoveResult(gameId, 1, "e7e5", level));

    [Fact]
    public async Task An_answer_is_a_move_by_the_levels_player_pinned_to_its_ply()
    {
        TestProbe region = CreateTestProbe();

        Task applying = Consumer(region).ApplyAsync("k", Result(), CancellationToken.None);
        MakeMove move = region.ExpectMsg<MakeMove>();
        region.Reply(new GameRejected(Game, RejectionCode.Conflict, "That move was for an earlier position."));
        await applying;

        Assert.Equal(new MakeMove(Game, -2, "e7e5", 1), move);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("{\"gameId\":\"0199f1c2a3b47c5d8e9f0a1b2c3d4e5f\",\"ply\":1,\"uci\":\"e7e5\",\"level\":\"1800\"}")]
    [InlineData("{\"gameId\":\"nope\",\"ply\":1,\"uci\":\"e7e5\",\"level\":\"1600\"}")]
    public async Task Unusable_answers_are_ignored(string json)
    {
        TestProbe region = CreateTestProbe();

        await Consumer(region).ApplyAsync("k", json, CancellationToken.None);

        region.ExpectNoMsg(TimeSpan.FromMilliseconds(100));
    }
}
