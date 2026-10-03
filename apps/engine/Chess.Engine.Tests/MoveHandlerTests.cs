using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;

namespace Chess.Engine.Tests;

public sealed class MoveHandlerTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 27, 12, 0, 0, TimeSpan.Zero);
    private const string Game = "01a0e2fc4a81768ca7d87f8c435fa756";
    private const string Fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

    /// <summary>A handler whose engines are fakes; <paramref name="script"/> scripts each new engine in turn.</summary>
    private sealed class Harness(params Func<FakeUci, Func<string, IEnumerable<string>>>[] script)
    {
        public List<FakeUci> Started { get; } = [];

        public MoveHandler Handler(EngineOptions? options = null) => new(StartAsync, options ?? new EngineOptions(), new FixedClock(Now), NullLogger.Instance);

        private async Task<UciEngine> StartAsync(CancellationToken ct)
        {
            FakeUci uci = new();
            if (Started.Count < script.Length)
            {
                uci.Respond = script[Started.Count](uci);
            }

            Started.Add(uci);
            UciEngine engine = new(uci, 16, TimeSpan.FromMilliseconds(200));
            await engine.InitializeAsync(ct);
            return engine;
        }
    }

    private static string Request(string level = "1600", int thinkMs = 50, DateTimeOffset? at = null, int ply = 1) =>
        JsonSerializer.Serialize(new MoveRequest(Game, ply, Fen, level, thinkMs, at ?? Now.AddSeconds(-1)), MoveHandler.Json);

    /// <summary>An engine that hangs on its first search (never says bestmove).</summary>
    private static Func<string, IEnumerable<string>> Hangs(FakeUci uci) =>
        line => line.StartsWith("go ", StringComparison.Ordinal) ? [] : FakeUci.Default(line);

    [Fact]
    public async Task A_request_is_answered_with_the_engines_move_for_the_same_game_and_ply()
    {
        Harness h = new();
        await using MoveHandler handler = h.Handler();

        MoveResult? result = await handler.HandleAsync(Request(ply: 7), CancellationToken.None);

        Assert.Equal(new MoveResult(Game, 7, "e2e4", "1600"), result);
        Assert.Contains("go movetime 50", h.Started.Single().Sent);
    }

    [Fact]
    public async Task One_engine_serves_request_after_request()
    {
        Harness h = new();
        await using MoveHandler handler = h.Handler();

        await handler.HandleAsync(Request(), CancellationToken.None);
        await handler.HandleAsync(Request("max"), CancellationToken.None);

        Assert.Single(h.Started);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("{}")]
    [InlineData("{\"gameId\":\"\",\"fen\":\"x\",\"level\":\"max\",\"thinkMs\":50}")]
    public async Task Unreadable_requests_are_dropped_without_starting_an_engine(string json)
    {
        Harness h = new();
        await using MoveHandler handler = h.Handler();

        Assert.Null(await handler.HandleAsync(json, CancellationToken.None));
        Assert.Empty(h.Started);
    }

    [Theory]
    [InlineData("1800x", 50)]
    [InlineData("1000", 50)]
    [InlineData("max", 0)]
    [InlineData("max", 60_001)]
    public async Task Out_of_range_levels_and_think_times_are_refused(string level, int thinkMs)
    {
        Harness h = new();
        await using MoveHandler handler = h.Handler();

        Assert.Null(await handler.HandleAsync(Request(level, thinkMs), CancellationToken.None));
        Assert.Empty(h.Started);
    }

    [Fact]
    public async Task A_request_older_than_the_limit_is_dropped()
    {
        Harness h = new();
        await using MoveHandler handler = h.Handler(new EngineOptions { MaxRequestAgeSeconds = 120 });

        Assert.Null(await handler.HandleAsync(Request(at: Now.AddSeconds(-121)), CancellationToken.None));
        Assert.NotNull(await handler.HandleAsync(Request(at: Now.AddSeconds(-119)), CancellationToken.None));
    }

    [Fact]
    public async Task A_hung_engine_is_replaced_and_the_search_tried_once_more()
    {
        Harness h = new(Hangs);
        await using MoveHandler handler = h.Handler();

        MoveResult? result = await handler.HandleAsync(Request(), CancellationToken.None);

        Assert.Equal("e2e4", result?.Uci);
        Assert.Equal(2, h.Started.Count);
        Assert.True(h.Started[0].Disposed);
    }

    [Fact]
    public async Task Two_failures_drop_the_request_and_the_next_request_gets_a_fresh_engine()
    {
        Harness h = new(Hangs, Hangs);
        await using MoveHandler handler = h.Handler();

        Assert.Null(await handler.HandleAsync(Request(), CancellationToken.None));
        Assert.NotNull(await handler.HandleAsync(Request(), CancellationToken.None));
        Assert.Equal(3, h.Started.Count);
    }

    [Fact]
    public async Task An_engine_that_died_between_requests_is_restarted_before_the_next_search()
    {
        Harness h = new();
        await using MoveHandler handler = h.Handler();
        await handler.HandleAsync(Request(), CancellationToken.None);
        h.Started[0].Exit();

        Assert.NotNull(await handler.HandleAsync(Request(), CancellationToken.None));
        Assert.Equal(2, h.Started.Count);
    }
}

public sealed class SettingsTests
{
    [Fact]
    public void The_defaults_are_valid_except_the_broker_which_must_be_set()
    {
        new EngineOptions().Validate();
        Assert.Throws<InvalidOperationException>(() => new EngineOptions { AnalysisProcesses = 17 }.Validate());
        Assert.Throws<InvalidOperationException>(() => new EngineOptions { ReviewProcesses = 17 }.Validate());
        Assert.Throws<InvalidOperationException>(() => new EngineOptions { MaxReviewAgeSeconds = 0 }.Validate());
        Assert.Throws<InvalidOperationException>(() => new KafkaOptions { BootstrapServers = "redpanda:9092", ReviewGroupId = "" }.Validate());
        new KafkaOptions { BootstrapServers = "redpanda:9092" }.Validate();
        Assert.Throws<InvalidOperationException>(() => new KafkaOptions().Validate());
    }

    [Theory]
    [InlineData(0, "Engine:Processes")]
    [InlineData(17, "Engine:Processes")]
    public void Nonsense_is_refused_naming_the_setting(int processes, string setting)
    {
        InvalidOperationException e = Assert.Throws<InvalidOperationException>(() => new EngineOptions { Processes = processes }.Validate());
        Assert.Contains(setting, e.Message, StringComparison.Ordinal);
    }
}
