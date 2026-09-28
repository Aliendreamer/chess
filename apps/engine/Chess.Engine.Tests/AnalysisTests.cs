using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;

namespace Chess.Engine.Tests;

public sealed class AnalysisLineTests
{
    [Fact]
    public void An_info_line_gives_its_rank_depth_score_and_moves()
    {
        Assert.True(AnalysisLine.TryParse("info depth 18 seldepth 25 multipv 2 score cp 35 nodes 999 nps 1 pv e2e4 e7e5 g1f3", true, out int k, out int depth, out AnalysisLine? line));

        Assert.Equal((2, 18), (k, depth));
        Assert.Equal((35, (int?)null), (line.Cp, line.Mate));
        Assert.Equal(["e2e4", "e7e5", "g1f3"], line.Pv);
    }

    [Fact]
    public void Scores_are_turned_to_whites_side_when_black_is_to_move()
    {
        AnalysisLine.TryParse("info depth 10 multipv 1 score cp 50 pv e7e5", whiteToMove: false, out _, out _, out AnalysisLine? cp);
        AnalysisLine.TryParse("info depth 10 multipv 1 score mate 2 pv d8h4", whiteToMove: false, out _, out _, out AnalysisLine? mate);

        Assert.Equal(-50, cp!.Cp);
        Assert.Equal(-2, mate!.Mate); // Black mates in 2
    }

    [Theory]
    [InlineData("info depth 10 multipv 1 score cp 20 lowerbound pv e2e4")] // a bound is only partial
    [InlineData("info string NNUE evaluation using nn.nnue")]
    [InlineData("info depth 1 currmove e2e4 currmovenumber 1")]
    [InlineData("bestmove e2e4")]
    public void Anything_else_is_not_a_line(string text) =>
        Assert.False(AnalysisLine.TryParse(text, true, out _, out _, out _));
}

public sealed class AnalyseTests
{
    private const string AfterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

    private static IEnumerable<string> ThreeLines(string line) => line.StartsWith("go ", StringComparison.Ordinal)
        ?
        [
            "info depth 5 multipv 1 score cp 10 pv c7c5",
            "info depth 12 multipv 1 score cp 30 pv e7e5 g1f3",
            "info depth 12 multipv 2 score cp 40 pv c7c5",
            "info depth 12 multipv 3 score mate -3 pv f7f6",
            "bestmove e7e5",
        ]
        : FakeUci.Default(line);

    [Fact]
    public async Task Analysis_is_full_strength_with_the_asked_lines_and_keeps_the_latest_of_each()
    {
        FakeUci uci = new() { Respond = ThreeLines };
        UciEngine engine = new(uci, 32, TimeSpan.FromSeconds(5));
        await engine.InitializeAsync(CancellationToken.None);
        uci.Sent.Clear();

        (int depth, IReadOnlyList<AnalysisLine> lines) = await engine.AnalyseAsync(AfterE4, 1000, 3, CancellationToken.None);

        Assert.Equal(12, depth);
        Assert.Equal([(int?)-30, -40, null], lines.Select(l => l.Cp)); // Black to move: turned to White's side
        Assert.Equal(3, lines[2].Mate); // Black is mated in 3 from White's side
        Assert.Contains("setoption name UCI_LimitStrength value false", uci.Sent);
        Assert.Contains("setoption name MultiPV value 3", uci.Sent);
        Assert.Equal("setoption name MultiPV value 1", uci.Sent[^1]); // back to one line for whoever searches next
    }
}

public sealed class AnalysisHandlerTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 28, 12, 0, 0, TimeSpan.Zero);
    private const string Start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    private static AnalysisHandler Handler(List<FakeUci> started) => new(
        async ct =>
        {
            FakeUci uci = new()
            {
                Respond = line => line.StartsWith("go ", StringComparison.Ordinal)
                    ? ["info depth 9 multipv 1 score cp 25 pv e2e4 e7e5", "bestmove e2e4"]
                    : FakeUci.Default(line),
            };
            started.Add(uci);
            UciEngine engine = new(uci, 16, TimeSpan.FromMilliseconds(500));
            await engine.InitializeAsync(ct);
            return engine;
        },
        new EngineOptions(),
        new FixedClock(Now),
        NullLogger.Instance);

    private static string Request(int multiPv = 3, int thinkMs = 100, DateTimeOffset? at = null) =>
        JsonSerializer.Serialize(new AnalysisRequest("key-1", Start, thinkMs, multiPv, at ?? Now.AddSeconds(-1)), Requests.Json);

    [Fact]
    public async Task A_request_is_answered_with_its_key_the_depth_and_the_lines()
    {
        List<FakeUci> started = [];
        await using AnalysisHandler handler = Handler(started);

        AnalysisResult? result = await handler.HandleAsync(Request(), CancellationToken.None);

        Assert.Equal(("key-1", Start, 100, 9), (result!.Key, result.Fen, result.ThinkMs, result.Depth));
        Assert.Equal(25, Assert.Single(result.Lines).Cp);
    }

    [Theory]
    [InlineData(0, 100)]
    [InlineData(6, 100)]
    [InlineData(3, 0)]
    [InlineData(3, 60_001)]
    public async Task Out_of_range_lines_or_think_times_are_refused(int multiPv, int thinkMs)
    {
        List<FakeUci> started = [];
        await using AnalysisHandler handler = Handler(started);

        Assert.Null(await handler.HandleAsync(Request(multiPv, thinkMs), CancellationToken.None));
        Assert.Empty(started);
    }

    [Fact]
    public async Task A_stale_or_unreadable_request_is_dropped()
    {
        List<FakeUci> started = [];
        await using AnalysisHandler handler = Handler(started);

        Assert.Null(await handler.HandleAsync(Request(at: Now.AddMinutes(-5)), CancellationToken.None));
        Assert.Null(await handler.HandleAsync("{not json", CancellationToken.None));
        Assert.Empty(started);
    }
}
