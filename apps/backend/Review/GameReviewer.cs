using Chess.Backend.Analysis;
using Chess.Backend.Games;

namespace Chess.Backend.Review;

/// <summary>One move of the game: its ply (1 = White's first), the move and the position after it.</summary>
internal sealed record ReviewMove(int Ply, string Uci, string San, string FenAfter);

internal sealed record OpeningName(string Eco, string Name);

/// <summary>A finished game and what is known about its positions: evaluations and opening names by position key.</summary>
internal sealed record ReviewInput(
    IReadOnlyList<ReviewMove> Moves,
    string? Result,
    string? Reason,
    IReadOnlyDictionary<string, Evaluation> Evaluations,
    IReadOnlyDictionary<string, OpeningName> Openings);

/// <summary>
/// A move as reviewed: the score after it (from White's side; <see cref="Chances"/> on −1…1), the engine's better move
/// and line from the position before it, and its class — <c>none</c>, <c>inaccuracy</c>, <c>mistake</c>,
/// <c>blunder</c>, or null while either position is not evaluated yet.
/// </summary>
internal sealed record ReviewedMove(
    int Ply,
    string Uci,
    string San,
    int? Cp,
    int? Mate,
    double? Chances,
    string? BestUci,
    string? BestSan,
    IReadOnlyList<string> Line,
    string? Class);

internal sealed record ReviewCounts(int Inaccuracies, int Mistakes, int Blunders);

/// <summary>The first move that left every named opening line, by whom, and the last opening the game was in.</summary>
internal sealed record BookExit(int Ply, string San, string Color, string Eco, string Name);

internal sealed record ReviewResult(
    int Evaluated,
    int Positions,
    IReadOnlyList<ReviewedMove> Moves,
    ReviewCounts White,
    ReviewCounts Black,
    BookExit? BookExit);

/// <summary>A position the review still needs from the engine.</summary>
internal sealed record ReviewPosition(string Key, string Fen);

/// <summary>A player's mistake, as practice keeps it (game-review D7).</summary>
internal sealed record PracticePosition(
    int Ply,
    string Fen,
    string PlayedUci,
    string PlayedSan,
    IReadOnlyList<string> AcceptedUci,
    IReadOnlyList<string> BestLine,
    string Class);

/// <summary>
/// The engine review of a finished game (game-review D1, D4, D5), pure: every move judged by the winning chances it
/// loses against the engine's best move (lichess's scale), the book exit, and a player's mistakes as practice.
/// </summary>
internal static class GameReviewer
{
    public const string None = "none";
    public const string Inaccuracy = "inaccuracy";
    public const string Mistake = "mistake";
    public const string Blunder = "blunder";

    /// <summary>A move the engine rates this close to its best is as good as its best (practice answers).</summary>
    public const double Tolerance = 0.1;

    /// <summary>The engine moves shown after the better move.</summary>
    private const int LineLength = 6;

    private const string Start = ChessRules.StartFen;

    /// <summary>Endings decided on the board: the last position is judged from the result, never by the engine.</summary>
    private static readonly HashSet<EndReason> BoardEndings =
    [
        EndReason.Checkmate,
        EndReason.Stalemate,
        EndReason.InsufficientMaterial,
        EndReason.ThreefoldRepetition,
        EndReason.FiftyMoveRule,
    ];

    /// <summary>White's winning chances on −1…1: a logistic of the centipawns (lichess's constant); a mate is certain.</summary>
    public static double Chances(EvaluationLine line)
    {
        ArgumentNullException.ThrowIfNull(line);
        if (line.Mate is { } mate)
        {
            return mate > 0 ? 1 : -1;
        }

        return (2 / (1 + Math.Exp(-0.00368208 * (line.Cp ?? 0)))) - 1;
    }

    /// <summary>The positions the engine has yet to evaluate, once each.</summary>
    public static IReadOnlyList<ReviewPosition> Missing(ReviewInput input)
    {
        ArgumentNullException.ThrowIfNull(input);
        return [.. Positions(input)
            .Select(fen => new ReviewPosition(PositionKey.Of(fen)!, fen))
            .DistinctBy(p => p.Key, StringComparer.Ordinal)
            .Where(p => !input.Evaluations.ContainsKey(p.Key))];
    }

    public static ReviewResult Review(ReviewInput input)
    {
        ArgumentNullException.ThrowIfNull(input);
        HashSet<string> keys = new(Positions(input).Select(f => PositionKey.Of(f)!), StringComparer.Ordinal);
        int evaluated = keys.Count(input.Evaluations.ContainsKey);

        List<ReviewedMove> moves = [];
        for (int i = 0; i < input.Moves.Count; i++)
        {
            moves.Add(Judge(input, i));
        }

        return new ReviewResult(
            evaluated,
            keys.Count,
            moves,
            Count(moves.Where(m => m.Ply % 2 == 1)),
            Count(moves.Where(m => m.Ply % 2 == 0)),
            Book(input));
    }

    /// <summary>The mistakes and blunders of the player of <paramref name="color"/> (<c>white</c> or <c>black</c>).</summary>
    public static IReadOnlyList<PracticePosition> Practice(ReviewInput input, string color)
    {
        ArgumentNullException.ThrowIfNull(input);
        int parity = color == "white" ? 1 : 0;
        List<PracticePosition> practice = [];
        foreach (ReviewedMove move in Review(input).Moves.Where(m => m.Ply % 2 == parity && m.Class is Mistake or Blunder))
        {
            string before = FenBefore(input, move.Ply - 1);
            IReadOnlyList<EvaluationLine> lines = input.Evaluations[PositionKey.Of(before)!].Lines;
            double sign = parity == 1 ? 1 : -1;
            double best = sign * Chances(lines[0]);
            practice.Add(new PracticePosition(
                move.Ply,
                before,
                move.Uci,
                move.San,
                [.. lines.Where(l => l.Pv.Count > 0 && best - (sign * Chances(l)) < Tolerance).Select(l => l.Pv[0]).Distinct(StringComparer.Ordinal)],
                [.. lines[0].Pv],
                move.Class!));
        }

        return practice;
    }

    /// <summary>The positions before each move, and the last one unless the board decided the game.</summary>
    private static IEnumerable<string> Positions(ReviewInput input)
    {
        int count = Terminal(input) ? input.Moves.Count : input.Moves.Count + 1;
        return Enumerable.Range(0, count).Select(i => FenBefore(input, i));
    }

    /// <summary>The position after <paramref name="ply"/> moves.</summary>
    private static string FenBefore(ReviewInput input, int ply) => ply == 0 ? Start : input.Moves[ply - 1].FenAfter;

    private static bool Terminal(ReviewInput input) =>
        EndReasons.Parse(input.Reason) is { } reason && BoardEndings.Contains(reason);

    private static ReviewedMove Judge(ReviewInput input, int index)
    {
        ReviewMove move = input.Moves[index];
        bool white = move.Ply % 2 == 1;
        string before = FenBefore(input, index);
        EvaluationLine? best = input.Evaluations.TryGetValue(PositionKey.Of(before)!, out Evaluation? b) && b.Lines.Count > 0 ? b.Lines[0] : null;

        (int? cp, int? mate, double? after) = After(input, index);
        string? bestUci = best?.Pv.Count > 0 ? best.Pv[0] : null;
        List<string> line = bestUci is null ? [] : Sans(before, best!.Pv);

        string? @class = null;
        if (best is not null && after is { } chances)
        {
            double sign = white ? 1 : -1;
            double loss = (sign * Chances(best)) - (sign * chances);
            @class = string.Equals(move.Uci, bestUci, StringComparison.Ordinal) ? None
                : loss >= 0.3 ? Blunder
                : loss >= 0.2 ? Mistake
                : loss >= 0.1 ? Inaccuracy
                : None;
        }

        return new ReviewedMove(move.Ply, move.Uci, move.San, cp, mate, after, bestUci, line.Count > 0 ? line[0] : null, line, @class);
    }

    /// <summary>The score after the move: the result's for a board ending, otherwise the engine's when known.</summary>
    private static (int? Cp, int? Mate, double? Chances) After(ReviewInput input, int index)
    {
        if (index == input.Moves.Count - 1 && Terminal(input))
        {
            return input.Result switch
            {
                PgnResults.WhiteWins => (null, null, 1),
                PgnResults.BlackWins => (null, null, -1),
                _ => (0, null, 0),
            };
        }

        return input.Evaluations.TryGetValue(PositionKey.Of(input.Moves[index].FenAfter)!, out Evaluation? e) && e.Lines.Count > 0
            ? (e.Lines[0].Cp, e.Lines[0].Mate, Chances(e.Lines[0]))
            : (null, null, null);
    }

    /// <summary>A line of UCI moves as SAN from <paramref name="fen"/>, as far as it plays.</summary>
    private static List<string> Sans(string fen, IReadOnlyList<string> pv)
    {
        List<string> sans = [];
        ChessRules rules = ChessRules.FromFen(fen);
        foreach (string uci in pv.Take(LineLength))
        {
            if (rules.TryApply(uci) is not MoveApplied applied)
            {
                break;
            }

            sans.Add(applied.San);
        }

        return sans;
    }

    private static ReviewCounts Count(IEnumerable<ReviewedMove> moves)
    {
        List<ReviewedMove> all = [.. moves];
        return new ReviewCounts(all.Count(m => m.Class == Inaccuracy), all.Count(m => m.Class == Mistake), all.Count(m => m.Class == Blunder));
    }

    private static BookExit? Book(ReviewInput input)
    {
        for (int ply = input.Moves.Count; ply >= 1; ply--)
        {
            if (input.Openings.TryGetValue(PositionKey.Of(input.Moves[ply - 1].FenAfter)!, out OpeningName? opening))
            {
                if (ply == input.Moves.Count)
                {
                    return null; // the whole game is a named line
                }

                ReviewMove next = input.Moves[ply];
                return new BookExit(next.Ply, next.San, next.Ply % 2 == 1 ? "white" : "black", opening.Eco, opening.Name);
            }
        }

        return null;
    }
}
