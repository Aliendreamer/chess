using System.Globalization;
using System.Text;
using Chess.Backend.Games;
using Chess.Backend.Projections;

namespace Chess.Backend.Studies;

/// <summary>What a study knows about the game it came from; missing values are written as PGN's unknowns.</summary>
internal sealed record StudyHeaders(string? White = null, string? Black = null, string? Result = null, string? Date = null);

/// <summary>
/// A study as PGN (studies D3): the seven-tag roster (Event is the title), <c>SetUp</c>/<c>FEN</c> for a custom start,
/// and movetext with each variation in parentheses right after the move it replaces.
/// </summary>
internal static class StudyPgn
{
    public static string Build(string title, StudyHeaders headers, string startFen, IReadOnlyList<StudyMove> tree)
    {
        ArgumentNullException.ThrowIfNull(headers);
        ArgumentNullException.ThrowIfNull(tree);
        string result = PgnResults.IsDecided(headers.Result) ? headers.Result! : PgnResults.None;
        StringBuilder pgn = new();
        Tag(pgn, "Event", title);
        Tag(pgn, "Site", GameProjection.Site);
        Tag(pgn, "Date", headers.Date ?? "????.??.??");
        Tag(pgn, "Round", "-");
        Tag(pgn, "White", headers.White ?? "?");
        Tag(pgn, "Black", headers.Black ?? "?");
        Tag(pgn, "Result", result);
        if (startFen != ChessRules.StartFen)
        {
            Tag(pgn, "SetUp", "1");
            Tag(pgn, "FEN", startFen);
        }

        List<string> tokens = [];
        Line(tokens, startFen, tree, forceNumber: true);
        tokens.Add(result);
        string movetext = string.Join(' ', tokens).Replace("( ", "(", StringComparison.Ordinal).Replace(" )", ")", StringComparison.Ordinal);
        return pgn.Append('\n').Append(movetext).Append('\n').ToString();
    }

    /// <summary>The first move of <paramref name="moves"/> continues the line; the others follow it as variations.</summary>
    private static void Line(List<string> tokens, string fenBefore, IReadOnlyList<StudyMove> moves, bool forceNumber)
    {
        if (moves.Count == 0)
        {
            return;
        }

        StudyMove main = moves[0];
        Move(tokens, fenBefore, main, forceNumber);
        foreach (StudyMove variation in moves.Skip(1))
        {
            tokens.Add("(");
            Move(tokens, fenBefore, variation, forceNumber: true);
            Line(tokens, variation.Fen, variation.Children, forceNumber: false);
            tokens.Add(")");
        }

        // After a variation, the main line resumes with its move number even on Black's move ("3... Nc6").
        Line(tokens, main.Fen, main.Children, forceNumber: moves.Count > 1);
    }

    private static void Move(List<string> tokens, string fenBefore, StudyMove move, bool forceNumber)
    {
        string[] fields = fenBefore.Split(' ');
        string number = fields.Length > 5 ? fields[5] : "1";
        if (fields.Length > 1 && fields[1] == "b")
        {
            if (forceNumber)
            {
                tokens.Add(string.Create(CultureInfo.InvariantCulture, $"{number}..."));
            }
        }
        else
        {
            tokens.Add(string.Create(CultureInfo.InvariantCulture, $"{number}."));
        }

        tokens.Add(move.San);
    }

    private static void Tag(StringBuilder pgn, string name, string value) =>
        pgn.Append('[').Append(name).Append(" \"")
            .Append(value.Replace("\\", "\\\\", StringComparison.Ordinal).Replace("\"", "\\\"", StringComparison.Ordinal))
            .Append("\"]\n");
}
