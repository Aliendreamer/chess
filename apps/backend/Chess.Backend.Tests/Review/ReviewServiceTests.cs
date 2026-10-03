using System.Text.Json;
using Chess.Backend.Analysis;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Games;
using Chess.Backend.Library;
using Chess.Backend.Review;
using Chess.Backend.Tests.Analysis;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Chess.Backend.Tests.Review;

public sealed class ReviewServiceTests
{
    private const long White = 1, Black = 2, Stranger = 3;
    private static readonly Guid GameId = Guid.CreateVersion7();
    private static readonly string[] Moves = ["f2f3", "e7e5", "g2g4", "d8h4"];

    private sealed class Stack
    {
        private readonly InMemoryDatabaseRoot _root = new();
        private readonly string _name = Guid.NewGuid().ToString("N");

        public FakeClock Clock { get; } = new(Time.Utc("2026-10-03T10:00:00Z"));

        public RecordingAnalysisRequests Requests { get; } = new();

        public ProjectDbContext Primary() => new(new DbContextOptionsBuilder<ProjectDbContext>().UseInMemoryDatabase(_name, _root).Options);

        public ReadDbContext Replica() => new(new DbContextOptionsBuilder<ReadDbContext>().UseInMemoryDatabase(_name, _root).Options);

        public ReviewService Review() => new(
            Primary(), Replica(), Requests, Options.Create(new ReviewOptions()), Options.Create(new AnalysisOptions()), Clock, NullLogger<ReviewService>.Instance);

        public PracticeService Practice() => new(Primary(), Replica(), Clock, NullLogger<PracticeService>.Instance);

        /// <summary>Fool's mate between White (1) and Black (2), ended or still played.</summary>
        public List<string> Game(bool ended = true)
        {
            using ProjectDbContext db = Primary();
            ChessRules rules = ChessRules.NewGame();
            List<string> fens = [ChessRules.StartFen];
            int ply = 0;
            foreach (string uci in ended ? Moves : Moves[..2])
            {
                MoveApplied m = (MoveApplied)rules.TryApply(uci);
                fens.Add(m.FenAfter);
                db.RmMoves.Add(new RmMove { GameId = GameId, Ply = ++ply, Uci = m.Uci, San = m.San, FenAfter = m.FenAfter });
            }

            db.RmGames.Add(new RmGame
            {
                GameId = GameId,
                WhiteId = White,
                WhiteName = "white",
                BlackId = Black,
                BlackName = "black",
                TimeControl = "5+0",
                Status = ended ? RmGame.Ended : RmGame.Playing,
                Result = ended ? "0-1" : null,
                Reason = ended ? "Checkmate" : null,
                Ply = ply,
                LastFen = fens[^1],
                EndedAt = ended ? Clock.Now : null,
            });
            db.Openings.Add(OpeningSeed.Parse("A00", "Barnes Opening", "1. f3")!);
            db.SaveChanges();
            return fens;
        }

        /// <summary>The worker's answers for the positions before each move (as the consumer stores them).</summary>
        public void Evaluated(List<string> fens, int count = 4)
        {
            (int? Cp, int? Mate, string[] Pv)[] answers =
            [
                (20, null, ["e2e4"]),
                (-50, null, ["e7e5"]),
                (-60, null, ["b1c3", "b8c6"]),
                (null, -1, ["d8h4"]),
            ];
            using ProjectDbContext db = Primary();
            for (int i = 0; i < count; i++)
            {
                string key = PositionKey.Of(fens[i])!;
                PositionEvaluation? row = db.PositionEvaluations.SingleOrDefault(e => e.PositionKey == key && e.ThinkMs == 800);
                if (row is null)
                {
                    row = new PositionEvaluation { PositionKey = key, ThinkMs = 800, Status = PositionEvaluation.Requested, RequestedAt = Clock.Now };
                    db.PositionEvaluations.Add(row);
                }

                row.Status = PositionEvaluation.Done;
                row.Depth = 18;
                row.Lines = JsonSerializer.Serialize(new[] { new EvaluationLine(answers[i].Cp, answers[i].Mate, answers[i].Pv) });
            }

            db.SaveChanges();
        }
    }

    [Fact]
    public async Task A_game_in_play_is_never_reviewed_nor_shown()
    {
        Stack stack = new();
        stack.Game(ended: false);

        Assert.Equal(ReviewRefusal.InPlay, (await stack.Review().StartAsync(GameId, White, admin: false, CancellationToken.None)).Refusal);
        Assert.Equal(ReviewView.Nothing, await stack.Review().ReadAsync(GameId, CancellationToken.None));
        Assert.Empty(stack.Requests.Reviewed);
    }

    [Fact]
    public async Task Only_a_player_or_an_admin_starts_a_review_and_an_unknown_game_is_not_found()
    {
        Stack stack = new();
        stack.Game();

        Assert.Equal(ReviewRefusal.NotPlayer, (await stack.Review().StartAsync(GameId, Stranger, admin: false, CancellationToken.None)).Refusal);
        Assert.Equal(ReviewRefusal.None, (await stack.Review().StartAsync(GameId, Stranger, admin: true, CancellationToken.None)).Refusal);
        Assert.Equal(ReviewRefusal.NotFound, (await stack.Review().StartAsync(Guid.CreateVersion7(), White, admin: false, CancellationToken.None)).Refusal);
        Assert.Null(await stack.Review().ReadAsync(Guid.CreateVersion7(), CancellationToken.None));
    }

    [Fact]
    public async Task Starting_asks_the_review_topic_once_for_each_missing_position_and_again_when_lost()
    {
        Stack stack = new();
        stack.Game();

        (_, ReviewView? view) = await stack.Review().StartAsync(GameId, Black, admin: false, CancellationToken.None);

        Assert.Equal((ReviewView.Running, 0, 4), (view!.Status, view.Evaluated, view.Positions)); // the mate is judged from the result
        Assert.Equal(4, stack.Requests.Reviewed.Count);
        Assert.All(stack.Requests.Reviewed, r => Assert.Equal((800, 3), (r.ThinkMs, r.MultiPv)));
        Assert.Empty(stack.Requests.Sent); // never the interactive topic

        await stack.Review().StartAsync(GameId, White, admin: false, CancellationToken.None);
        Assert.Equal(4, stack.Requests.Reviewed.Count); // on their way: not asked again

        stack.Clock.Advance(TimeSpan.FromMinutes(16));
        await stack.Review().StartAsync(GameId, White, admin: false, CancellationToken.None);
        Assert.Equal(8, stack.Requests.Reviewed.Count); // lost: asked again
    }

    [Fact]
    public async Task A_complete_review_marks_the_moves_and_names_the_book_exit()
    {
        Stack stack = new();
        List<string> fens = stack.Game();
        await stack.Review().StartAsync(GameId, White, admin: false, CancellationToken.None);
        stack.Evaluated(fens, count: 3);

        ReviewView running = (await stack.Review().ReadAsync(GameId, CancellationToken.None))!;
        Assert.Equal((ReviewView.Running, 3), (running.Status, running.Evaluated));

        stack.Evaluated(fens);
        ReviewView review = (await stack.Review().ReadAsync(GameId, CancellationToken.None))!;
        Assert.Equal(ReviewView.Complete, review.Status);
        Assert.Equal(["inaccuracy", "none", "blunder", "none"], review.Moves.Select(m => m.Class));
        Assert.Equal(new BookExit(2, "e5", "black", "A00", "Barnes Opening"), review.BookExit);
    }

    [Fact]
    public async Task A_players_mistakes_are_added_to_practice_once_and_only_from_a_complete_review()
    {
        Stack stack = new();
        List<string> fens = stack.Game();
        await stack.Review().StartAsync(GameId, White, admin: false, CancellationToken.None);

        Assert.Equal(ReviewRefusal.NotComplete, (await stack.Review().AddPracticeAsync(GameId, White, CancellationToken.None)).Refusal);

        stack.Evaluated(fens);
        Assert.Equal((ReviewRefusal.None, 1), await stack.Review().AddPracticeAsync(GameId, White, CancellationToken.None));
        Assert.Equal((ReviewRefusal.None, 0), await stack.Review().AddPracticeAsync(GameId, White, CancellationToken.None));
        Assert.Equal((ReviewRefusal.None, 0), await stack.Review().AddPracticeAsync(GameId, Black, CancellationToken.None));
        Assert.Equal(ReviewRefusal.NotPlayer, (await stack.Review().AddPracticeAsync(GameId, Stranger, CancellationToken.None)).Refusal);
    }

    [Fact]
    public async Task Practice_brings_a_wrong_answer_back_first_and_spaces_out_a_right_one()
    {
        Stack stack = new();
        List<string> fens = stack.Game();
        await stack.Review().StartAsync(GameId, White, admin: false, CancellationToken.None);
        stack.Evaluated(fens);
        await stack.Review().AddPracticeAsync(GameId, White, CancellationToken.None);

        PracticeItem item = (await stack.Practice().NextAsync(White, CancellationToken.None)).Item!;
        Assert.Equal((3, "g4", "blunder", "white", "black"), (item.Ply, item.PlayedSan, item.Class, item.White, item.Black));
        Assert.Equal(["b1c3"], item.AcceptedUci);
        Assert.Null((await stack.Practice().NextAsync(Black, CancellationToken.None)).Item); // private to its member

        Assert.Equal(0, (await stack.Practice().RecordAsync(White, GameId, 3, correct: false, CancellationToken.None))!.Box);
        Assert.NotNull((await stack.Practice().NextAsync(White, CancellationToken.None)).Item); // back at once

        PracticeResult right = (await stack.Practice().RecordAsync(White, GameId, 3, correct: true, CancellationToken.None))!;
        Assert.Equal((1, stack.Clock.Now.AddDays(1)), (right.Box, right.DueAt));
        PracticeNext later = await stack.Practice().NextAsync(White, CancellationToken.None);
        Assert.Equal((null, stack.Clock.Now.AddDays(1)), (later.Item, later.NextDueAt));
        Assert.Equal(new PracticeSummary(1, 0, 0), await stack.Practice().MineAsync(White, CancellationToken.None));
        Assert.Null(await stack.Practice().RecordAsync(White, GameId, 4, correct: true, CancellationToken.None));
    }
}
