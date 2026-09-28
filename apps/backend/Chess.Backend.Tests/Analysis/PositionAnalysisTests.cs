using System.Text.Json;
using Chess.Backend.Analysis;
using Chess.Backend.WebApi.Analysis;
using FluentValidation.TestHelper;

namespace Chess.Backend.Tests.Analysis;

public sealed class PositionAnalysisTests
{
    private const string Start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    private const string StartKey = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
    private const string AfterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    private const string AfterE4Key = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -";
    private static readonly DateTimeOffset Now = new(2026, 9, 28, 12, 0, 0, TimeSpan.Zero);

    private sealed class Requests : IAnalysisRequests
    {
        public List<AnalysisRequestMessage> Sent { get; } = [];

        public Task RequestAsync(AnalysisRequestMessage request, CancellationToken ct)
        {
            Sent.Add(request);
            return Task.CompletedTask;
        }
    }

    private static (ProjectDbContext Db, AnalysisService Service, Requests Sent, FakeClock Clock) Build()
    {
        FakeClock clock = new(Now);
        ProjectDbContext db = TestDb.Create(clock);
        Requests sent = new();
        return (db, new AnalysisService(db, NullLogger<AnalysisService>.Instance, sent, Options.Create(new AnalysisOptions()), clock), sent, clock);
    }

    private static string Result(string key, int thinkMs, int depth, int cp = 30) => JsonSerializer.Serialize(
        new AnalysisResultMessage(key, key + " 0 1", thinkMs, depth, [new EvaluationLine(cp, null, ["e2e4", "e7e5"])]));

    [Theory]
    [InlineData(Start, StartKey)]
    [InlineData("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 12 40", StartKey)] // the move counters do not matter
    [InlineData(AfterE4, AfterE4Key)] // no black pawn beside e4: the en-passant square is dropped
    [InlineData("rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3", "rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3")]
    [InlineData("rnbqkbnr/pppp1ppp/8/3Pp3/8/8/PPP1PPPP/RNBQKBNR w KQkq e6 0 3", "rnbqkbnr/pppp1ppp/8/3Pp3/8/8/PPP1PPPP/RNBQKBNR w KQkq e6")]
    public void A_position_key_keeps_what_changes_an_evaluation(string fen, string key) =>
        Assert.Equal(key, PositionKey.Of(fen));

    [Theory]
    [InlineData("")]
    [InlineData("not a fen")]
    [InlineData("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1")]
    public void Anything_but_a_position_has_no_key(string fen) => Assert.Null(PositionKey.Of(fen));

    [Fact]
    public async Task An_unknown_position_is_asked_of_the_engine_once_and_answered_later()
    {
        (ProjectDbContext db, AnalysisService service, Requests sent, _) = Build();
        using (db)
        {
            IReadOnlyList<PositionAnswer> first = await service.AnalyseAsync([Start, Start, AfterE4], 3_000, CancellationToken.None);
            IReadOnlyList<PositionAnswer> again = await service.AnalyseAsync([Start], 3_000, CancellationToken.None);

            Assert.Equal([StartKey, StartKey, AfterE4Key], first.Select(a => a.Key));
            Assert.All(first.Concat(again), a => Assert.Null(a.Evaluation));
            Assert.Equal([(StartKey, Start, 3_000, 3), (AfterE4Key, AfterE4, 3_000, 3)], sent.Sent.Select(r => (r.Key, r.Fen, r.ThinkMs, r.MultiPv)));
        }
    }

    [Fact]
    public async Task A_request_left_unanswered_past_the_retry_time_is_sent_again()
    {
        (ProjectDbContext db, AnalysisService service, Requests sent, FakeClock clock) = Build();
        using (db)
        {
            await service.AnalyseAsync([Start], 1_000, CancellationToken.None);
            clock.Advance(TimeSpan.FromSeconds(119));
            await service.AnalyseAsync([Start], 1_000, CancellationToken.None);
            clock.Advance(TimeSpan.FromSeconds(2));
            await service.AnalyseAsync([Start], 1_000, CancellationToken.None);

            Assert.Equal(2, sent.Sent.Count);
            Assert.Equal(Now.AddSeconds(121), (await db.PositionEvaluations.SingleAsync()).RequestedAt);
        }
    }

    [Fact]
    public async Task A_stored_result_answers_that_think_time_and_shorter_ones_but_not_longer()
    {
        (ProjectDbContext db, AnalysisService service, Requests sent, FakeClock clock) = Build();
        using (db)
        {
            await new AnalysisResultConsumer(db, clock).ApplyAsync(StartKey, Result(StartKey, 3_000, 22), CancellationToken.None);

            Evaluation? normal = (await service.AnalyseAsync([Start], 3_000, CancellationToken.None))[0].Evaluation;
            Evaluation? quick = (await service.AnalyseAsync([Start], 1_000, CancellationToken.None))[0].Evaluation;
            Evaluation? deep = (await service.AnalyseAsync([Start], 10_000, CancellationToken.None))[0].Evaluation;

            EvaluationLine line = Assert.Single(normal!.Lines);
            Assert.Equal((30, (int?)null), (line.Cp, line.Mate));
            Assert.Equal(["e2e4", "e7e5"], line.Pv);
            Assert.Equal((3_000, 22), (quick!.ThinkMs, quick.Depth));
            Assert.Null(deep);
            Assert.Equal(10_000, Assert.Single(sent.Sent).ThinkMs);
        }
    }

    [Fact]
    public async Task The_longest_think_answers_when_several_are_known()
    {
        (ProjectDbContext db, AnalysisService service, _, FakeClock clock) = Build();
        using (db)
        {
            AnalysisResultConsumer consumer = new(db, clock);
            await consumer.ApplyAsync(StartKey, Result(StartKey, 3_000, 22, cp: 20), CancellationToken.None);
            await consumer.ApplyAsync(StartKey, Result(StartKey, 10_000, 30, cp: 25), CancellationToken.None);

            Evaluation? e = (await service.AnalyseAsync([Start], 1_000, CancellationToken.None))[0].Evaluation;

            Assert.Equal((10_000, 25), (e!.ThinkMs, e.Lines[0].Cp));
        }
    }

    [Fact]
    public async Task A_repeated_answer_replaces_the_stored_one_only_when_it_went_as_deep()
    {
        (ProjectDbContext db, _, _, FakeClock clock) = Build();
        using (db)
        {
            AnalysisResultConsumer consumer = new(db, clock);
            await consumer.ApplyAsync(StartKey, Result(StartKey, 3_000, 22, cp: 20), CancellationToken.None);
            await consumer.ApplyAsync(StartKey, Result(StartKey, 3_000, 18, cp: 90), CancellationToken.None);
            PositionEvaluation kept = await db.PositionEvaluations.SingleAsync();
            Assert.Equal(22, kept.Depth);

            await consumer.ApplyAsync(StartKey, Result(StartKey, 3_000, 24, cp: 15), CancellationToken.None);
            Assert.Equal((24, PositionEvaluation.Done), (kept.Depth, kept.Status));
            Assert.Equal(15, AnalysisService.ToEvaluation(kept).Lines[0].Cp);
        }
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("null")]
    [InlineData("{\"key\":\"\",\"thinkMs\":1000,\"depth\":1,\"lines\":[]}")]
    [InlineData("{\"key\":\"k\",\"thinkMs\":1000,\"depth\":1}")]
    public async Task Unreadable_results_are_skipped(string json)
    {
        (ProjectDbContext db, _, _, FakeClock clock) = Build();
        using (db)
        {
            await new AnalysisResultConsumer(db, clock).ApplyAsync("k", json, CancellationToken.None);

            Assert.Empty(db.PositionEvaluations);
        }
    }

    [Theory]
    [InlineData("quick", 1_000)]
    [InlineData("normal", 3_000)]
    [InlineData("deep", 10_000)]
    public void A_think_name_maps_to_its_time(string think, int ms) => Assert.Equal(ms, new AnalysisOptions().ThinkMs(think));

    [Fact]
    public void A_request_needs_a_think_name_and_positions_that_are_all_fens()
    {
        AnalysePositionsRequestValidator v = new();
        Assert.True(v.TestValidate(new AnalysePositionsRequest { Positions = [Start, AfterE4], Think = "deep" }).IsValid);
        v.TestValidate(new AnalysePositionsRequest { Positions = [Start], Think = "forever" }).ShouldHaveValidationErrorFor(r => r.Think);
        v.TestValidate(new AnalysePositionsRequest { Positions = [] }).ShouldHaveValidationErrorFor(r => r.Positions);
        Assert.False(v.TestValidate(new AnalysePositionsRequest { Positions = [Start, "e4"] }).IsValid);
    }
}
