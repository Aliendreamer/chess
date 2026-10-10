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
    public async Task A_game_nobody_asked_about_shows_no_review_even_when_its_positions_are_known()
    {
        Stack stack = new();
        stack.Evaluated(stack.Game());

        Assert.Equal(ReviewView.Nothing, await stack.Review().ReadAsync(GameId, CancellationToken.None));
        (_, ReviewView? asked) = await stack.Review().StartAsync(GameId, White, admin: false, CancellationToken.None);
        Assert.Equal(ReviewView.Complete, asked!.Status); // at once: nothing left for the engine
        Assert.Empty(stack.Requests.Reviewed);
    }

    [Fact]
    public async Task A_finished_game_is_reviewed_automatically_once_the_read_model_has_its_end()
    {
        Stack stack = new();
        stack.Game();
        using (ProjectDbContext db = stack.Primary())
        {
            db.RmGames.Single().LastSeq = 5;
            db.SaveChanges();
        }

        await Assert.ThrowsAsync<InvalidOperationException>(() => stack.Review().StartAutomaticAsync(GameId, 6, CancellationToken.None));
        await Assert.ThrowsAsync<InvalidOperationException>(() => stack.Review().StartAutomaticAsync(Guid.CreateVersion7(), 1, CancellationToken.None));
        Assert.Empty(stack.Requests.Reviewed);

        Assert.True(await stack.Review().StartAutomaticAsync(GameId, 5, CancellationToken.None));
        Assert.Equal(4, stack.Requests.Reviewed.Count);
        using ProjectDbContext check = stack.Primary();
        Assert.Equal(White, check.GameReviews.Single().RequestedBy);
        Assert.Equal(ReviewView.Running, (await stack.Review().ReadAsync(GameId, CancellationToken.None))!.Status);
    }

    [Theory]
    [InlineData("Aborted", 4)]
    [InlineData("Resignation", 1)]
    public async Task An_aborted_game_or_one_of_a_single_move_is_not_reviewed_automatically(string reason, int ply)
    {
        Stack stack = new();
        stack.Game();
        using (ProjectDbContext db = stack.Primary())
        {
            RmGame game = db.RmGames.Single();
            (game.Reason, game.Ply, game.LastSeq) = (reason, ply, 9);
            db.SaveChanges();
        }

        Assert.False(await stack.Review().StartAutomaticAsync(GameId, 9, CancellationToken.None));
        Assert.Empty(stack.Requests.Reviewed);
    }

    [Fact]
    public async Task A_players_mistakes_come_only_from_a_complete_review()
    {
        Stack stack = new();
        List<string> fens = stack.Game();
        await stack.Review().StartAsync(GameId, White, admin: false, CancellationToken.None);

        Assert.Null(await stack.Review().MistakesAsync(GameId, White, CancellationToken.None));

        stack.Evaluated(fens);
        PracticePosition g4 = Assert.Single((await stack.Review().MistakesAsync(GameId, White, CancellationToken.None))!);
        Assert.Equal((3, "g4", "blunder"), (g4.Ply, g4.PlayedSan, g4.Class));
        Assert.Empty((await stack.Review().MistakesAsync(GameId, Black, CancellationToken.None))!);
        Assert.Empty((await stack.Review().MistakesAsync(GameId, Stranger, CancellationToken.None))!);
    }
}
