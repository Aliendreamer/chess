using System.Globalization;
using System.Text;

namespace Chess.Backend.Games;

/// <summary>What a finished game's PGN is built from: names as snapshotted on the game (D23) and the SAN move list.</summary>
internal sealed record PgnGame(
    string Site,
    DateTimeOffset StartedAt,
    string White,
    string Black,
    string TimeControl,
    string Result,
    string Reason,
    IReadOnlyList<string> San);

/// <summary>
/// Builds PGN from the stored SAN list (ROADMAP D22), with no rules library: the exchange format of a finished game.
/// Seven-tag roster plus <c>TimeControl</c> (PGN seconds form) and <c>Termination</c>; movetext numbered and
/// wrapped under 80 columns, ending in the result.
/// </summary>
internal static class Pgn
{
    private const int MaxLine = 79;

    public static string Build(PgnGame game)
    {
        ArgumentNullException.ThrowIfNull(game);
        StringBuilder pgn = new();
        Tag(pgn, "Event", "Live game");
        Tag(pgn, "Site", game.Site);
        Tag(pgn, "Date", game.StartedAt.UtcDateTime.ToString("yyyy.MM.dd", CultureInfo.InvariantCulture));
        Tag(pgn, "Round", "-");
        Tag(pgn, "White", game.White);
        Tag(pgn, "Black", game.Black);
        Tag(pgn, "Result", game.Result);
        Tag(pgn, "TimeControl", SecondsForm(game.TimeControl));
        Tag(pgn, "Termination", Termination(game.Reason));
        pgn.Append('\n');
        AppendMovetext(pgn, game.San, game.Result);
        return pgn.ToString();
    }

    private static void Tag(StringBuilder pgn, string name, string value) =>
        pgn.Append('[').Append(name).Append(" \"")
            .Append(value.Replace("\\", "\\\\", StringComparison.Ordinal).Replace("\"", "\\\"", StringComparison.Ordinal))
            .Append("\"]\n");

    /// <summary><c>5+3</c> (minutes + increment seconds) → <c>300+3</c> (PGN: base seconds + increment seconds).</summary>
    private static string SecondsForm(string timeControl) =>
        TimeControl.TryParse(timeControl, out TimeControl tc)
            ? string.Create(CultureInfo.InvariantCulture, $"{tc.Minutes * 60}+{tc.IncrementSeconds}")
            : "-";

    private static string Termination(string reason) => reason switch
    {
        nameof(EndReason.Timeout) or nameof(EndReason.TimeoutVsInsufficientMaterial) => "time forfeit",
        nameof(EndReason.Aborted) => "abandoned",
        _ => "normal",
    };

    private static void AppendMovetext(StringBuilder pgn, IReadOnlyList<string> san, string result)
    {
        List<string> tokens = [];
        for (int ply = 0; ply < san.Count; ply++)
        {
            if (ply % 2 == 0)
            {
                tokens.Add(string.Create(CultureInfo.InvariantCulture, $"{(ply / 2) + 1}."));
            }

            tokens.Add(san[ply]);
        }

        tokens.Add(result);
        int lineLength = 0;
        foreach (string token in tokens)
        {
            if (lineLength > 0 && lineLength + 1 + token.Length > MaxLine)
            {
                pgn.Append('\n');
                lineLength = 0;
            }
            else if (lineLength > 0)
            {
                pgn.Append(' ');
                lineLength++;
            }

            pgn.Append(token);
            lineLength += token.Length;
        }

        pgn.Append('\n');
    }
}
