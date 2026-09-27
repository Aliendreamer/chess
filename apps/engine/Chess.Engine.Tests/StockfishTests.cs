namespace Chess.Engine.Tests;

public sealed class EngineLevelTests
{
    [Theory]
    [InlineData("max", null)]
    [InlineData("1320", 1320)]
    [InlineData("2400", 2400)]
    [InlineData("3190", 3190)]
    public void Accepts_max_and_elos_in_the_engines_range(string text, int? elo)
    {
        Assert.True(EngineLevel.TryParse(text, out EngineLevel level));
        Assert.Equal(elo, level.Elo);
        Assert.Equal(text, level.ToString());
    }

    [Theory]
    [InlineData("1319")]
    [InlineData("3191")]
    [InlineData("MAX")]
    [InlineData("-1600")]
    [InlineData("")]
    [InlineData(null)]
    public void Refuses_anything_else(string? text) => Assert.False(EngineLevel.TryParse(text, out _));

    [Fact]
    public void An_elo_limits_strength_and_max_lifts_the_limit()
    {
        Assert.Equal(["setoption name UCI_LimitStrength value true", "setoption name UCI_Elo value 1600"], new EngineLevel(1600).Options());
        Assert.Equal(["setoption name UCI_LimitStrength value false", "setoption name Skill Level value 20"], EngineLevel.Max.Options());
    }
}

public sealed class UciEngineTests
{
    private const string Fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

    private static async Task<(UciEngine Engine, FakeUci Uci)> Started(TimeSpan? slack = null)
    {
        FakeUci uci = new();
        UciEngine engine = new(uci, 32, slack ?? TimeSpan.FromSeconds(5));
        await engine.InitializeAsync(CancellationToken.None);
        return (engine, uci);
    }

    [Fact]
    public async Task The_handshake_sets_one_thread_and_the_hash_then_waits_until_ready()
    {
        (_, FakeUci uci) = await Started();

        Assert.Equal(["uci", "setoption name Threads value 1", "setoption name Hash value 32", "isready"], uci.Sent);
    }

    [Fact]
    public async Task A_search_sets_the_level_the_position_and_the_move_time()
    {
        (UciEngine engine, FakeUci uci) = await Started();
        uci.Sent.Clear();

        string? move = await engine.BestMoveAsync(Fen, new EngineLevel(2000), 5000, CancellationToken.None);

        Assert.Equal("e2e4", move);
        Assert.Equal(
            [
                "ucinewgame",
                "setoption name UCI_LimitStrength value true",
                "setoption name UCI_Elo value 2000",
                "isready",
                $"position fen {Fen}",
                "go movetime 5000",
            ],
            uci.Sent);
    }

    [Fact]
    public async Task No_legal_move_is_null()
    {
        (UciEngine engine, FakeUci uci) = await Started();
        uci.Respond = line => line.StartsWith("go ", StringComparison.Ordinal) ? ["bestmove (none)"] : FakeUci.Default(line);

        Assert.Null(await engine.BestMoveAsync(Fen, EngineLevel.Max, 100, CancellationToken.None));
    }

    [Fact]
    public async Task An_engine_that_never_answers_times_out_after_the_move_time_and_slack()
    {
        (UciEngine engine, FakeUci uci) = await Started(slack: TimeSpan.FromMilliseconds(100));
        uci.Respond = line => line.StartsWith("go ", StringComparison.Ordinal) ? ["info depth 1"] : FakeUci.Default(line);

        await Assert.ThrowsAsync<TimeoutException>(() => engine.BestMoveAsync(Fen, EngineLevel.Max, 50, CancellationToken.None));
    }

    [Fact]
    public async Task An_engine_that_exits_mid_search_is_end_of_stream()
    {
        (UciEngine engine, FakeUci uci) = await Started();
        uci.Respond = line =>
        {
            if (line.StartsWith("go ", StringComparison.Ordinal))
            {
                uci.Exit();
            }

            return FakeUci.Default(line).Where(l => !l.StartsWith("bestmove", StringComparison.Ordinal));
        };

        await Assert.ThrowsAsync<EndOfStreamException>(() => engine.BestMoveAsync(Fen, EngineLevel.Max, 5000, CancellationToken.None));
        Assert.False(engine.IsAlive);
    }
}
