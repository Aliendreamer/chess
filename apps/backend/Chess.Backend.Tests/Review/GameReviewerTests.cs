using Chess.Backend.Analysis;
using Chess.Backend.Games;
using Chess.Backend.Review;

namespace Chess.Backend.Tests.Review;

public sealed class GameReviewerTests
{
    private static readonly string Start = ChessRules.NewGame().Fen;

    /// <summary>Fool's mate: 1.f3 e5 2.g4 Qh4#, 0-1 by checkmate.</summary>
    private static List<ReviewMove> FoolsMate()
    {
        ChessRules rules = ChessRules.NewGame();
        List<ReviewMove> moves = [];
        foreach (string uci in new[] { "f2f3", "e7e5", "g2g4", "d8h4" })
        {
            MoveApplied applied = (MoveApplied)rules.TryApply(uci);
            moves.Add(new ReviewMove(moves.Count + 1, applied.Uci, applied.San, applied.FenAfter));
        }

        return moves;
    }

    private static string Key(string fen) => PositionKey.Of(fen)!;

    private static Evaluation Eval(params EvaluationLine[] lines) => new(800, 18, lines);

    private static EvaluationLine Cp(int cp, params string[] pv) => new(cp, null, pv);

    private static EvaluationLine Mate(int mate, params string[] pv) => new(null, mate, pv);

    /// <summary>Every position before a move evaluated: the start, after f3, after e5, after g4.</summary>
    private static Dictionary<string, Evaluation> Evaluations(List<ReviewMove> m) => new(StringComparer.Ordinal)
    {
        [Key(Start)] = Eval(Cp(20, "e2e4")),
        [Key(m[0].FenAfter)] = Eval(Cp(-50, "e7e5")),
        [Key(m[1].FenAfter)] = Eval(Cp(-60, "b1c3", "b8c6"), Cp(-70, "d2d4"), Cp(-300, "h2h3")),
        [Key(m[2].FenAfter)] = Eval(Mate(-1, "d8h4")),
    };

    private static ReviewInput Input(List<ReviewMove> moves, Dictionary<string, Evaluation> evaluations, string reason = "Checkmate", string result = "0-1") => new(
        moves,
        result,
        reason,
        evaluations,
        new Dictionary<string, OpeningName>(StringComparer.Ordinal)
        {
            [Key(moves[0].FenAfter)] = new("A00", "Barnes Opening"),
            [Key(moves[1].FenAfter)] = new("A00", "Barnes Opening: Fool's Mate"),
        });

    [Fact]
    public void Winning_chances_follow_the_score_and_a_mate_is_certain()
    {
        Assert.Equal(0, GameReviewer.Chances(Cp(0)), 3);
        Assert.Equal(-GameReviewer.Chances(Cp(150)), GameReviewer.Chances(Cp(-150)), 6);
        Assert.InRange(GameReviewer.Chances(Cp(300)), 0.5, 0.6);
        Assert.Equal((1.0, -1.0), (GameReviewer.Chances(Mate(3)), GameReviewer.Chances(Mate(-2))));
    }

    [Fact]
    public void Moves_are_marked_by_the_chances_they_lose_against_the_engines_move()
    {
        List<ReviewMove> moves = FoolsMate();

        ReviewResult review = GameReviewer.Review(Input(moves, Evaluations(moves)));

        Assert.Equal(["inaccuracy", "none", "blunder", "none"], review.Moves.Select(m => m.Class));
        Assert.Equal((4, 4), (review.Evaluated, review.Positions)); // the mate itself is judged from the result
        Assert.Equal(new ReviewCounts(1, 0, 1), review.White);
        Assert.Equal(new ReviewCounts(0, 0, 0), review.Black);
        ReviewedMove g4 = review.Moves[2];
        Assert.Equal(("b1c3", "Nc3"), (g4.BestUci, g4.BestSan));
        Assert.Equal(["Nc3", "Nc6"], g4.Line);
        Assert.Equal(-1.0, review.Moves[3].Chances); // after Qh4#: Black has won
    }

    [Fact]
    public void The_engines_own_move_is_never_marked()
    {
        List<ReviewMove> moves = FoolsMate();
        Dictionary<string, Evaluation> evaluations = Evaluations(moves);
        evaluations[Key(moves[1].FenAfter)] = Eval(Cp(900, "b1c3")); // a noisy evaluation after e5

        Assert.Equal("none", GameReviewer.Review(Input(moves, evaluations)).Moves[1].Class);
    }

    [Fact]
    public void A_review_in_progress_marks_only_what_it_can_judge()
    {
        List<ReviewMove> moves = FoolsMate();
        Dictionary<string, Evaluation> evaluations = Evaluations(moves);
        evaluations.Remove(Key(moves[2].FenAfter));

        ReviewResult review = GameReviewer.Review(Input(moves, evaluations));

        Assert.Equal((3, 4), (review.Evaluated, review.Positions));
        Assert.Equal(["inaccuracy", "none", null, null], review.Moves.Select(m => m.Class));
        Assert.Equal([Key(moves[2].FenAfter)], GameReviewer.Missing(Input(moves, evaluations)).Select(p => p.Key));
    }

    [Fact]
    public void A_resigned_games_last_position_is_evaluated_like_any_other()
    {
        List<ReviewMove> moves = FoolsMate()[..3];

        ReviewInput input = Input(moves, Evaluations(moves), reason: "Resignation", result: "0-1");

        Assert.Equal(4, GameReviewer.Review(input).Positions);
        Assert.Empty(GameReviewer.Missing(input));
    }

    [Fact]
    public void The_book_exit_is_the_move_after_the_last_named_position()
    {
        List<ReviewMove> moves = FoolsMate();

        BookExit exit = GameReviewer.Review(Input(moves, Evaluations(moves))).BookExit!;

        Assert.Equal(new BookExit(3, "g4", "white", "A00", "Barnes Opening: Fool's Mate"), exit);
    }

    [Fact]
    public void A_players_mistakes_become_practice_with_every_move_the_engine_accepts()
    {
        List<ReviewMove> moves = FoolsMate();
        ReviewInput input = Input(moves, Evaluations(moves));

        PracticePosition g4 = Assert.Single(GameReviewer.Practice(input, "white"));

        Assert.Equal((3, "g2g4", "g4", "blunder"), (g4.Ply, g4.PlayedUci, g4.PlayedSan, g4.Class));
        Assert.Equal(moves[1].FenAfter, g4.Fen);
        Assert.Equal(["b1c3", "d2d4"], g4.AcceptedUci); // h3 loses too much to count
        Assert.Equal(["b1c3", "b8c6"], g4.BestLine);
        Assert.Empty(GameReviewer.Practice(input, "black"));
    }
}
