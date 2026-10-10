using System.Text.Json;
using Chess.Backend.Analysis;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Games;
using Chess.Backend.Review;
using Chess.Backend.Tests.Analysis;
using Chess.Backend.Training;
using Microsoft.EntityFrameworkCore.Storage;

namespace Chess.Backend.Tests.Training;

/// <summary>The miner's judging (training D1, D3): critical or quiet, the phase, and which positions it looks at.</summary>
public sealed class CriticalMomentsTests
{
    /// <summary>After 1. e4 e5 2. Nf3: Black to move, many moves.</summary>
    private const string Open = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";

    /// <summary>White in check from the rook on a1 with one way out (Kh2).</summary>
    private const string OnlyMove = "7k/8/8/8/8/8/6PP/r6K w - - 0 1";

    private static EvaluationLine Line(int cp, params string[] pv) => new(cp, null, pv);

    [Fact]
    public void A_best_move_far_ahead_of_the_second_is_critical_from_the_movers_side()
    {
        // Black to move: −300 is Black's good line, +50 its second; the gap is measured for Black.
        CriticalMoment moment = CriticalMoments.Judge(Open, [Line(-300, "b8c6", "f1b5"), Line(50, "d7d6"), Line(60, "g8f6")], 0.25)!;

        Assert.Equal(["b8c6"], moment.AcceptedUci);
        Assert.Equal(["b8c6", "f1b5"], moment.BestLine);
        Assert.InRange(moment.Gap, 0.25, 1);
    }

    [Fact]
    public void Lines_close_together_are_quiet_and_every_line_within_the_tolerance_is_accepted()
    {
        Assert.Null(CriticalMoments.Judge(Open, [Line(-20, "b8c6"), Line(-5, "d7d6")], 0.25)); // 0.05 apart

        // White to move here (a made-up position): the best two lines are close, the third is the critical gap.
        string white = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
        Assert.Null(CriticalMoments.Judge(white, [Line(300, "g1f3"), Line(290, "b1c3"), Line(-100, "d1h5")], 0.25));
    }

    [Fact]
    public void A_single_legal_move_or_a_single_line_is_never_critical()
    {
        Assert.Null(CriticalMoments.Judge(OnlyMove, [Line(-50, "h1h2"), Line(-900, "g2g3")], 0.25));
        Assert.Null(CriticalMoments.Judge(Open, [Line(-300, "b8c6")], 0.25));
        Assert.Null(CriticalMoments.Judge("not a fen", [Line(-300, "b8c6"), Line(50, "d7d6")], 0.25));
    }

    [Theory]
    [InlineData(ChessRules.StartFen, "middlegame")]
    [InlineData("r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1", "endgame")] // queens off
    [InlineData("3qk3/pppppppp/8/8/8/8/PPPPPPPP/3QK3 w - - 0 1", "endgame")] // a queen each: 9 ≤ 13
    [InlineData("3qkr2/pppppppp/8/8/8/8/PPPPPPPP/3QKR2 w - - 0 1", "middlegame")] // queen and rook: 14
    [InlineData("3qk3/pppppppp/8/8/8/8/PPPPPPPP/2RQKR2 w - - 0 1", "middlegame")] // one side over 13, queens on
    public void The_phase_is_read_from_the_material(string fen, string phase) =>
        Assert.Equal(phase, CriticalMoments.Phase(fen));

    [Fact]
    public void A_round_picks_one_position_per_game_never_the_same_position_twice()
    {
        Guid a = Guid.NewGuid(), b = Guid.NewGuid(), c = Guid.NewGuid();
        LibrarySpot[] spots =
        [
            new("k1", a, 20, "e2e4"), new("k2", a, 21, "e7e5"),
            new("k1", b, 22, "e2e4"),
            new("k3", c, 30, "d2d4"),
        ];

        for (int seed = 0; seed < 20; seed++)
        {
            IReadOnlyList<LibrarySpot> picked = CriticalMoments.Pick(spots, 10, new Random(seed));
            Assert.Equal(picked.Count, picked.Select(s => s.GameId).Distinct().Count());
            Assert.Equal(picked.Count, picked.Select(s => s.PositionKey).Distinct(StringComparer.Ordinal).Count());
            Assert.Contains(picked, s => s.GameId == c);
            Assert.True(picked.Count >= 2);
        }

        Assert.Single(CriticalMoments.Pick(spots, 1, new Random(1)));
    }

    [Fact]
    public void The_position_of_a_ply_is_replayed_from_the_moves()
    {
        Assert.Equal(ChessRules.StartFen, CriticalMoments.FenAt(["e2e4"], 0));
        Assert.StartsWith("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b", CriticalMoments.FenAt(["e2e4", "e7e5"], 1), StringComparison.Ordinal);
        Assert.Null(CriticalMoments.FenAt(["e2e4"], 2));
        Assert.Null(CriticalMoments.FenAt(["e2e5"], 1));
    }
}

/// <summary>The miner's round against the database (training D3), in memory with games in id order instead of random.</summary>
public sealed class TrainingMineRoundTests
{
    private static readonly string[] Moves = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6"];

    private readonly InMemoryDatabaseRoot _root = new();
    private readonly string _name = Guid.NewGuid().ToString("N");
    private readonly FakeClock _clock = new(Time.Utc("2026-10-10T10:00:00Z"));
    private readonly RecordingAnalysisRequests _requests = new();

    private ProjectDbContext Db() => new(new DbContextOptionsBuilder<ProjectDbContext>().UseInMemoryDatabase(_name, _root).Options);

    private TrainingMineRound Round(ProjectDbContext db, int inFlight = 20, int perGame = 3) => new(
        db,
        _requests,
        new TrainingOptions { MinPly = 2, InFlight = inFlight, PerGame = perGame },
        new ReviewOptions(),
        new AnalysisOptions(),
        _clock,
        q => q.OrderBy(g => g.Id));

    /// <summary>A Ruy Lopez to ply 8, with its positions from ply 0 (the last has no next move).</summary>
    private Guid Game(string white = "Kasparov, Garry")
    {
        Guid id = Guid.NewGuid();
        using ProjectDbContext db = Db();
        db.LibraryGames.Add(new LibraryGame
        {
            Id = id,
            White = white,
            Black = "Karpov, Anatoly",
            Event = "World Championship",
            Year = 1985,
            Result = "1-0",
            Eco = "C78",
            OpeningName = "Ruy Lopez",
            MovesUci = [.. Moves],
            Ply = Moves.Length,
            Source = "Test",
            Licence = "moves only (facts)",
            DedupeKey = id.ToString(),
        });
        for (int ply = 0; ply <= Moves.Length; ply++)
        {
            db.LibraryPositions.Add(new LibraryPosition
            {
                PositionKey = PositionKey.Of(CriticalMoments.FenAt(Moves, ply)!)! + "#" + id.ToString("N"), // distinct per game
                GameId = id,
                Ply = ply,
                NextUci = ply < Moves.Length ? Moves[ply] : null,
                Result = "1-0",
                Source = "Test",
            });
        }

        db.SaveChanges();
        return id;
    }

    private void Evaluate(string key, params EvaluationLine[] lines)
    {
        using ProjectDbContext db = Db();
        db.PositionEvaluations.Add(new PositionEvaluation
        {
            PositionKey = key,
            ThinkMs = 10_000,
            Status = PositionEvaluation.Done,
            Depth = 20,
            Lines = JsonSerializer.Serialize(lines),
            RequestedAt = _clock.Now,
        });
        db.SaveChanges();
    }

    [Fact]
    public async Task Top_up_looks_at_most_PerGame_positions_of_a_game_from_MinPly_on()
    {
        Guid game = Game();
        for (int round = 0; round < 6; round++)
        {
            using ProjectDbContext db = Db();
            await Round(db).TopUpAsync(CancellationToken.None);
        }

        using ProjectDbContext check = Db();
        List<TrainingCandidate> candidates = [.. check.TrainingCandidates];
        Assert.Equal(3, candidates.Count);
        Assert.All(candidates, c => Assert.True(c.Ply >= 2 && c.Ply < Moves.Length && c.LibraryGameId == game && c.Status == TrainingCandidate.Waiting));
        Assert.All(candidates, c => Assert.Equal(Moves[c.Ply], c.MasterUci));
        Assert.Equal(3, _requests.Reviewed.Count); // nothing cached: each asked once, on the review topic
        Assert.Empty(_requests.Sent);
    }

    [Fact]
    public async Task Top_up_stops_at_InFlight_and_does_not_ask_for_a_cached_evaluation()
    {
        Game();
        Game("Tal, Mikhail");
        Game("Fischer, Robert");

        using (ProjectDbContext db = Db())
        {
            Assert.Equal(2, await Round(db, inFlight: 2).TopUpAsync(CancellationToken.None));
        }

        using (ProjectDbContext db = Db())
        {
            Assert.Equal(0, await Round(db, inFlight: 2).TopUpAsync(CancellationToken.None)); // two waiting already
        }

        Assert.Equal(2, _requests.Reviewed.Count);
    }

    [Fact]
    public async Task Judging_keeps_a_critical_position_with_its_facts_and_marks_a_quiet_one()
    {
        Game();
        for (int round = 0; round < 2; round++)
        {
            using ProjectDbContext db = Db();
            await Round(db, perGame: 2).TopUpAsync(CancellationToken.None); // one position of a game per round
        }

        List<TrainingCandidate> waiting;
        using (ProjectDbContext db = Db())
        {
            waiting = [.. db.TrainingCandidates.OrderBy(c => c.Ply)];
        }

        TrainingCandidate critical = waiting[0], quiet = waiting[1];
        bool white = critical.Ply % 2 == 0;
        int sign = white ? 1 : -1;
        Evaluate(critical.PositionKey, new EvaluationLine(sign * 250, null, ["a2a3", "a7a6"]), new EvaluationLine(sign * -50, null, [critical.MasterUci]));
        Evaluate(quiet.PositionKey, new EvaluationLine(10, null, ["a2a3"]), new EvaluationLine(0, null, ["h2h3"]));

        using (ProjectDbContext db = Db())
        {
            Assert.Equal((1, 1), await Round(db).JudgeAsync(CancellationToken.None));
        }

        using ProjectDbContext check = Db();
        Assert.Equal(TrainingCandidate.Critical, check.TrainingCandidates.Single(c => c.PositionKey == critical.PositionKey).Status);
        Assert.Equal(TrainingCandidate.Quiet, check.TrainingCandidates.Single(c => c.PositionKey == quiet.PositionKey).Status);
        TrainingPosition position = check.TrainingPositions.Single();
        Assert.Equal((critical.PositionKey, critical.MasterUci, critical.Ply), (position.PositionKey, position.MasterUci, position.Ply));
        Assert.Equal(["a2a3"], position.AcceptedUci);
        Assert.Equal(["a2a3", "a7a6"], position.BestLine);
        Assert.Equal(("Kasparov, Garry", "Karpov, Anatoly", "C78", 1985, "middlegame"), (position.White, position.Black, position.Eco, position.Year, position.Phase));
        Assert.Equal(white ? "white" : "black", position.SideToMove);
    }

    [Fact]
    public async Task A_candidate_waiting_four_retry_periods_is_asked_again()
    {
        Game();
        using (ProjectDbContext db = Db())
        {
            await Round(db, perGame: 1).TopUpAsync(CancellationToken.None);
        }

        Assert.Single(_requests.Reviewed);
        _clock.Advance(TimeSpan.FromSeconds((new ReviewOptions().RetryAfterSeconds * 4) - 1));
        using (ProjectDbContext db = Db())
        {
            await Round(db, perGame: 1).JudgeAsync(CancellationToken.None);
        }

        Assert.Single(_requests.Reviewed);
        _clock.Advance(TimeSpan.FromSeconds(2));
        using (ProjectDbContext db = Db())
        {
            await Round(db, perGame: 1).JudgeAsync(CancellationToken.None);
        }

        Assert.Equal(2, _requests.Reviewed.Count);
    }
}

/// <summary>Sessions, verdicts and the lazy copy of reviews (training D2, D4), in memory.</summary>
public sealed class TrainingServiceTests
{
    private const long White = 1, Black = 2;
    private static readonly string[] FoolsMate = ["f2f3", "e7e5", "g2g4", "d8h4"];

    private readonly InMemoryDatabaseRoot _root = new();
    private readonly string _name = Guid.NewGuid().ToString("N");
    private readonly FakeClock _clock = new(Time.Utc("2026-10-10T10:00:00Z"));
    private readonly RecordingAnalysisRequests _requests = new();

    private ProjectDbContext Primary() => new(new DbContextOptionsBuilder<ProjectDbContext>().UseInMemoryDatabase(_name, _root).Options);

    private ReadDbContext Replica() => new(new DbContextOptionsBuilder<ReadDbContext>().UseInMemoryDatabase(_name, _root).Options);

    private ReviewService Reviews(ProjectDbContext db) => new(
        db, Replica(), _requests, Options.Create(new ReviewOptions()), Options.Create(new AnalysisOptions()), _clock, NullLogger<ReviewService>.Instance);

    private TrainingService Service()
    {
        ProjectDbContext db = Primary();
        return new TrainingService(db, Replica(), Reviews(db), _clock, NullLogger<TrainingService>.Instance);
    }

    /// <summary>Fool's mate between White (1) and Black (2), its review asked for and every position evaluated.</summary>
    private Guid ReviewedGame()
    {
        Guid gameId = Guid.CreateVersion7();
        using ProjectDbContext db = Primary();
        ChessRules rules = ChessRules.NewGame();
        List<string> fens = [ChessRules.StartFen];
        int ply = 0;
        foreach (string uci in FoolsMate)
        {
            MoveApplied m = (MoveApplied)rules.TryApply(uci);
            fens.Add(m.FenAfter);
            db.RmMoves.Add(new RmMove { GameId = gameId, Ply = ++ply, Uci = m.Uci, San = m.San, FenAfter = m.FenAfter });
        }

        db.RmGames.Add(new RmGame
        {
            GameId = gameId,
            WhiteId = White,
            WhiteName = "white",
            BlackId = Black,
            BlackName = "black",
            TimeControl = "5+0",
            Status = RmGame.Ended,
            Result = "0-1",
            Reason = "Checkmate",
            Ply = ply,
            LastFen = fens[^1],
            EndedAt = _clock.Now,
        });
        db.GameReviews.Add(new GameReview { GameId = gameId, RequestedBy = White, RequestedAt = _clock.Now });
        (int? Cp, int? Mate, string[] Pv)[] answers = [(20, null, ["e2e4"]), (-50, null, ["e7e5"]), (-60, null, ["b1c3"]), (null, -1, ["d8h4"])];
        for (int i = 0; i < answers.Length; i++)
        {
            db.PositionEvaluations.Add(new PositionEvaluation
            {
                PositionKey = PositionKey.Of(fens[i])!,
                ThinkMs = 800,
                Status = PositionEvaluation.Done,
                Depth = 18,
                Lines = JsonSerializer.Serialize(new[] { new EvaluationLine(answers[i].Cp, answers[i].Mate, answers[i].Pv) }),
                RequestedAt = _clock.Now,
            });
        }

        db.SaveChanges();
        return gameId;
    }

    private TrainingPosition Position(string eco = "B90", string phase = "middlegame", int year = 1990, string master = "e2e4", params string[] accepted)
    {
        TrainingPosition position = new()
        {
            Id = Guid.NewGuid(),
            PositionKey = Guid.NewGuid().ToString("N"),
            Fen = ChessRules.StartFen,
            SideToMove = "white",
            LibraryGameId = Guid.NewGuid(),
            Ply = 24,
            MasterUci = master,
            AcceptedUci = [.. accepted.Length == 0 ? ["d2d4"] : accepted],
            BestLine = [.. accepted.Length == 0 ? ["d2d4", "d7d5"] : accepted],
            Gap = 0.4f,
            Eco = eco,
            OpeningName = "Sicilian Defense",
            Phase = phase,
            White = "Kasparov, Garry",
            Black = "Karpov, Anatoly",
            Event = "World Championship",
            Year = year,
            CreatedAt = _clock.Now,
        };
        using ProjectDbContext db = Primary();
        db.TrainingPositions.Add(position);
        db.SaveChanges();
        return position;
    }

    private static DrillState Drill(string id, int box, string due, string updated) => new(id, box, Time.Utc(due), Time.Utc(updated));

    [Fact]
    public void Mistakes_come_due_first_oldest_due_then_by_box_and_oldest_answered_never_excluded()
    {
        DateTimeOffset now = Time.Utc("2026-10-10T10:00:00Z");
        DrillState[] drills =
        [
            Drill("a", 2, "2026-10-12T00:00:00Z", "2026-10-01T00:00:00Z"),
            Drill("b", 1, "2026-10-11T00:00:00Z", "2026-10-05T00:00:00Z"),
            Drill("c", 1, "2026-10-11T00:00:00Z", "2026-10-03T00:00:00Z"),
            Drill("d", 3, "2026-10-09T00:00:00Z", "2026-10-02T00:00:00Z"),
            Drill("e", 0, "2026-10-08T00:00:00Z", "2026-10-02T00:00:00Z"),
        ];
        HashSet<string> none = [];

        Assert.Equal("e", TrainingReads.NextDrill(drills, none, now)); // oldest due
        Assert.Equal("d", TrainingReads.NextDrill(drills, new HashSet<string>(["e"]), now));
        Assert.Equal("c", TrainingReads.NextDrill(drills, new HashSet<string>(["e", "d"]), now)); // lowest box, oldest answered
        Assert.Equal("a", TrainingReads.NextDrill(drills, new HashSet<string>(["e", "d", "c", "b"]), now));
        Assert.Null(TrainingReads.NextDrill(drills, new HashSet<string>(["a", "b", "c", "d", "e"]), now));
    }

    [Theory]
    [InlineData(true, true, "both")]
    [InlineData(true, false, "master")]
    [InlineData(false, true, "engine")]
    [InlineData(false, false, "none")]
    public void A_verdict_names_which_move_it_was(bool master, bool engine, string verdict) =>
        Assert.Equal(verdict, TrainingVerdicts.Of(master, engine));

    [Theory]
    [InlineData("games", "g:0199f1c2a3b47c5d8e9f0a1b2c3d4e5f:12", true)]
    [InlineData("games", "g:0199f1c2a3b47c5d8e9f0a1b2c3d4e5f:0", false)]
    [InlineData("games", "p:0199f1c2a3b47c5d8e9f0a1b2c3d4e5f", false)]
    [InlineData("library", "p:0199f1c2a3b47c5d8e9f0a1b2c3d4e5f", true)]
    [InlineData("library", "p:0199F1C2A3B47C5D8E9F0A1B2C3D4E5F", false)]
    [InlineData("library", "p:0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f", false)]
    [InlineData("other", "p:0199f1c2a3b47c5d8e9f0a1b2c3d4e5f", false)]
    public void Ids_follow_the_mode(string mode, string id, bool valid) =>
        Assert.Equal(valid, TrainingIds.IsValid(mode, id));

    [Fact]
    public async Task A_complete_review_is_copied_into_the_players_pool_once_and_none_of_the_opponents_mistakes()
    {
        Guid game = ReviewedGame();

        Assert.Equal(1, await Service().SyncAsync(White, CancellationToken.None));
        Assert.Equal(0, await Service().SyncAsync(White, CancellationToken.None));
        Assert.Equal(0, await Service().SyncAsync(Black, CancellationToken.None));

        using ProjectDbContext db = Primary();
        MistakeDrill drill = db.MistakeDrills.Single();
        Assert.Equal((White, game, 3, "g4", "blunder"), (drill.UserId, drill.GameId, drill.Ply, drill.PlayedSan, drill.Class));
        Assert.Equal(2, db.TrainingSynced.Count()); // both players' copies are done
    }

    [Fact]
    public async Task A_review_still_running_is_copied_later_and_its_lost_positions_asked_again()
    {
        Guid game = ReviewedGame();
        using (ProjectDbContext db = Primary())
        {
            db.PositionEvaluations.Remove(db.PositionEvaluations.First(e => e.Lines!.Contains("b1c3")));
            db.SaveChanges();
        }

        Assert.Equal(0, await Service().SyncAsync(White, CancellationToken.None));
        Assert.Single(_requests.Reviewed);
        using (ProjectDbContext db = Primary())
        {
            Assert.Empty(db.TrainingSynced);
            PositionEvaluation asked = db.PositionEvaluations.Single(e => e.Status == PositionEvaluation.Requested);
            (asked.Status, asked.Depth, asked.Lines) = (PositionEvaluation.Done, 18, JsonSerializer.Serialize(new[] { new EvaluationLine(-60, null, ["b1c3"]) }));
            db.SaveChanges();
        }

        Assert.Equal(1, await Service().SyncAsync(White, CancellationToken.None));
        Assert.Equal(game, Assert.Single(Primary().MistakeDrills).GameId);
    }

    [Fact]
    public async Task My_games_offers_the_members_mistakes_and_judges_by_the_engine()
    {
        Guid game = ReviewedGame();

        TrainingNext next = await Service().NextAsync(White, TrainingModes.Games, TrainingFilter.None, [], CancellationToken.None);
        TrainingItem item = next.Item!;
        Assert.Equal((TrainingIds.Game(game, 3), "games", "white", 0, 1), (item.Id, item.Mode, item.SideToMove, item.Box, next.Pool));
        Assert.Null((await Service().NextAsync(White, TrainingModes.Games, TrainingFilter.None, [item.Id], CancellationToken.None)).Item);
        Assert.Null((await Service().NextAsync(Black, TrainingModes.Games, TrainingFilter.None, [], CancellationToken.None)).Item); // private

        TrainingVerdict wrong = (await Service().AnswerAsync(White, TrainingModes.Games, item.Id, "g2g4", CancellationToken.None))!;
        Assert.Equal((false, "none", null, "g2g4", 0, _clock.Now), (wrong.Correct, wrong.Verdict, wrong.MasterUci, wrong.PlayedUci, wrong.Box, wrong.DueAt));
        GameTrainingSource source = Assert.IsType<GameTrainingSource>(wrong.Source);
        Assert.Equal((game, 3, "black"), (source.GameId, source.Ply, source.Opponent));

        TrainingVerdict right = (await Service().AnswerAsync(White, TrainingModes.Games, item.Id, "b1c3", CancellationToken.None))!;
        Assert.Equal((true, "engine", 1, _clock.Now.AddDays(1), false), (right.Correct, right.Verdict, right.Box, right.DueAt, right.Learned));

        Assert.Null(await Service().AnswerAsync(Black, TrainingModes.Games, item.Id, "b1c3", CancellationToken.None));
        Assert.Null(await Service().AnswerAsync(White, TrainingModes.Library, item.Id, "b1c3", CancellationToken.None));
    }

    [Fact]
    public async Task Master_games_judge_the_masters_move_the_engines_and_both()
    {
        TrainingPosition position = Position(master: "e2e4", accepted: ["d2d4", "e2e4"]);
        string id = TrainingIds.Position(position.Id);

        TrainingVerdict both = (await Service().AnswerAsync(White, TrainingModes.Library, id, "e2e4", CancellationToken.None))!;
        Assert.Equal((true, "both", "e2e4", null, 1), (both.Correct, both.Verdict, both.MasterUci, both.PlayedUci, both.Box));
        LibraryTrainingSource source = Assert.IsType<LibraryTrainingSource>(both.Source);
        Assert.Equal((position.LibraryGameId, "Kasparov, Garry", "Karpov, Anatoly", "World Championship", 1990, 24), (source.LibraryGameId, source.White, source.Black, source.Event, source.Year, source.Ply));
        Assert.Equal("engine", (await Service().AnswerAsync(White, TrainingModes.Library, id, "d2d4", CancellationToken.None))!.Verdict);
        TrainingVerdict none = (await Service().AnswerAsync(White, TrainingModes.Library, id, "a2a3", CancellationToken.None))!;
        Assert.Equal((false, "none", 0, _clock.Now), (none.Correct, none.Verdict, none.Box, none.DueAt));

        TrainingPosition onlyMaster = Position(master: "g1f3", accepted: ["d2d4"]);
        Assert.Equal("master", (await Service().AnswerAsync(White, TrainingModes.Library, TrainingIds.Position(onlyMaster.Id), "g1f3", CancellationToken.None))!.Verdict);
        Assert.Null(await Service().AnswerAsync(White, TrainingModes.Library, TrainingIds.Position(Guid.NewGuid()), "e2e4", CancellationToken.None));
    }

    [Fact]
    public async Task Master_games_offer_the_due_ones_first_then_new_ones_never_an_excluded_one()
    {
        TrainingPosition seen = Position();
        TrainingPosition fresh1 = Position();
        TrainingPosition fresh2 = Position();
        await Service().AnswerAsync(White, TrainingModes.Library, TrainingIds.Position(seen.Id), "a2a3", CancellationToken.None); // box 0, due now

        TrainingNext first = await Service().NextAsync(White, TrainingModes.Library, TrainingFilter.None, [], CancellationToken.None);
        Assert.Equal((TrainingIds.Position(seen.Id), 0, 3), (first.Item!.Id, first.Item.Box, first.Pool));

        List<string> shown = [first.Item.Id];
        for (int i = 0; i < 2; i++)
        {
            TrainingItem item = (await Service().NextAsync(White, TrainingModes.Library, TrainingFilter.None, shown, CancellationToken.None)).Item!;
            Assert.Null(item.Box);
            shown.Add(item.Id);
        }

        Assert.Equal(new[] { TrainingIds.Position(fresh1.Id), TrainingIds.Position(fresh2.Id) }.Order(StringComparer.Ordinal), shown[1..].Order(StringComparer.Ordinal));
        Assert.Null((await Service().NextAsync(White, TrainingModes.Library, TrainingFilter.None, shown, CancellationToken.None)).Item);

        // Answered right: not due, not new — nothing more for now.
        await Service().AnswerAsync(White, TrainingModes.Library, TrainingIds.Position(seen.Id), "d2d4", CancellationToken.None);
        await Service().AnswerAsync(White, TrainingModes.Library, TrainingIds.Position(fresh1.Id), "d2d4", CancellationToken.None);
        await Service().AnswerAsync(White, TrainingModes.Library, TrainingIds.Position(fresh2.Id), "d2d4", CancellationToken.None);
        Assert.Null((await Service().NextAsync(White, TrainingModes.Library, TrainingFilter.None, [], CancellationToken.None)).Item);
        Assert.NotNull((await Service().NextAsync(Black, TrainingModes.Library, TrainingFilter.None, [], CancellationToken.None)).Item); // progress is per member
    }

    [Fact]
    public async Task Master_games_filter_by_eco_prefix_phase_and_years()
    {
        Position(eco: "B90", phase: "middlegame", year: 1985);
        TrainingPosition endgame = Position(eco: "B92", phase: "endgame", year: 2001);
        Position(eco: "C42", phase: "endgame", year: 2001);

        async Task<(string? Id, int Pool)> Next(TrainingFilter filter)
        {
            TrainingNext next = await Service().NextAsync(White, TrainingModes.Library, filter, [], CancellationToken.None);
            return (next.Item?.Id, next.Pool);
        }

        Assert.Equal(2, (await Next(new TrainingFilter("B9", "any", null, null, null))).Pool);
        Assert.Equal(2, (await Next(new TrainingFilter("b9", "any", null, null, null))).Pool);
        Assert.Equal(1, (await Next(new TrainingFilter("B90", "any", null, null, null))).Pool);
        Assert.Equal((TrainingIds.Position(endgame.Id), 1), await Next(new TrainingFilter("B", "endgame", null, 2000, 2010)));
        Assert.Equal(2, (await Next(new TrainingFilter(null, "endgame", null, null, null))).Pool);
        Assert.Equal(1, (await Next(new TrainingFilter(null, "any", null, null, 1990))).Pool);
        Assert.Equal((null, 0), await Next(new TrainingFilter("A", "any", null, null, null)));
    }

    [Fact]
    public async Task The_summary_counts_both_pools_for_the_member()
    {
        ReviewedGame();
        TrainingPosition position = Position();
        Position();
        await Service().AnswerAsync(White, TrainingModes.Library, TrainingIds.Position(position.Id), "d2d4", CancellationToken.None);

        TrainingSummary mine = await Service().SummaryAsync(White, CancellationToken.None);
        Assert.Equal(new GamesTraining(1, 0, 1), mine.Games);
        Assert.Equal(new LibraryTraining(2, 1, 0, 0), mine.Library);
        Assert.Equal(new TrainingSummary(new GamesTraining(0, 0, 0), new LibraryTraining(2, 0, 0, 0)), await Service().SummaryAsync(Black, CancellationToken.None));
    }
}

/// <summary>The automatic review (training D2): every game event guarded by its seq, a review started on a real ending.</summary>
public sealed class AutoReviewConsumerTests
{
    private static readonly Guid Game = Guid.Parse("0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f");
    private static readonly DateTimeOffset T0 = Time.Utc("2026-10-10T10:00:00Z");

    private static string Env<T>(string type, long seq, T payload) =>
        Chess.Backend.Events.EventJson.Serialize(new Chess.Backend.Events.EventEnvelope<T>(type, 1, Game.ToString("N"), seq, T0.AddSeconds(seq), payload));

    private static string Move(long seq) => Env("game.move-made", seq, new Chess.Backend.Events.MoveMade((int)seq - 1, "e2e4", "e4", ChessRules.StartFen, 0, 0, T0));

    private static string Ended(long seq, string reason) => Env("game.ended", seq, new Chess.Backend.Events.GameEnded("1-0", reason, 0, 0, T0));

    [Fact]
    public async Task An_ending_starts_the_review_once_and_an_abort_none()
    {
        ProjectDbContext db = TestDb.Create();
        Mock<IReviewService> reviews = new();
        reviews.Setup(r => r.StartAutomaticAsync(Game, It.IsAny<long>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        AutoReviewConsumer consumer = new(db, reviews.Object, NullLogger<AutoReviewConsumer>.Instance);

        Assert.Equal(Chess.Backend.Projections.ProjectionOutcome.Applied, await consumer.ApplyAsync("k", Move(1), CancellationToken.None));
        Assert.Equal(Chess.Backend.Projections.ProjectionOutcome.Applied, await consumer.ApplyAsync("k", Ended(2, "Resignation"), CancellationToken.None));
        Assert.Equal(Chess.Backend.Projections.ProjectionOutcome.Skipped, await consumer.ApplyAsync("k", Ended(2, "Resignation"), CancellationToken.None));
        reviews.Verify(r => r.StartAutomaticAsync(Game, 2, It.IsAny<CancellationToken>()), Times.Once);

        await Assert.ThrowsAsync<Chess.Backend.Projections.ProjectionGapException>(() => consumer.ApplyAsync("k", Move(4), CancellationToken.None));
        Assert.Equal(Chess.Backend.Projections.ProjectionOutcome.Applied, await consumer.ApplyAsync("k", Ended(3, "Aborted"), CancellationToken.None));
        reviews.Verify(r => r.StartAutomaticAsync(It.IsAny<Guid>(), 3, It.IsAny<CancellationToken>()), Times.Never);
        Assert.Equal(Chess.Backend.Projections.ProjectionOutcome.Ignored, await consumer.ApplyAsync("k", Envelopes.Pinged("p1", 1), CancellationToken.None));
    }

    [Fact]
    public async Task A_read_model_behind_leaves_the_watermark_so_the_record_is_retried()
    {
        ProjectDbContext db = TestDb.Create();
        Mock<IReviewService> reviews = new();
        reviews.Setup(r => r.StartAutomaticAsync(Game, 1, It.IsAny<CancellationToken>())).ThrowsAsync(new InvalidOperationException("behind"));
        AutoReviewConsumer consumer = new(db, reviews.Object, NullLogger<AutoReviewConsumer>.Instance);

        await Assert.ThrowsAsync<InvalidOperationException>(() => consumer.ApplyAsync("k", Ended(1, "Checkmate"), CancellationToken.None));
        Assert.Empty(db.ConsumerPositions);
    }
}
