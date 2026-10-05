using System.Runtime.CompilerServices;
using System.Text;
using System.Text.RegularExpressions;
using Chess.Backend.Games;

namespace Chess.Backend.Library;

/// <summary>One game of a PGN file: its place in the file (from 1), its headers, and its main line as written.</summary>
internal sealed record PgnGame(int Index, IReadOnlyDictionary<string, string> Headers, IReadOnlyList<string> San);

/// <summary>
/// A streaming PGN reader (broadcast-explorer D3), pure: one game at a time from a <see cref="TextReader"/>, so a month of
/// broadcasts never sits in memory. It keeps headers and the main line's SAN and skips <c>{…}</c> and <c>;</c>
/// comments, <c>(…)</c> variations, <c>$n</c> NAGs, move numbers and the result. SAN becomes UCI only on demand
/// (<see cref="ToUci"/>), so games a filter drops are never replayed.
/// </summary>
internal static partial class PgnReader
{
    private static readonly string[] Results = ["1-0", "0-1", "1/2-1/2", "*"];

    public static async IAsyncEnumerable<PgnGame> ReadAsync(TextReader reader, [EnumeratorCancellation] CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(reader);
        Dictionary<string, string> headers = new(StringComparer.Ordinal);
        StringBuilder movetext = new();
        int commentDepth = 0;
        int index = 0;
        string? line;
        while ((line = await reader.ReadLineAsync(ct)) is not null)
        {
            if (commentDepth == 0 && HeaderPattern().Match(line) is { Success: true } header)
            {
                if (movetext.Length > 0)
                {
                    yield return new PgnGame(++index, headers, Tokens(movetext.ToString()));
                    headers = new(StringComparer.Ordinal);
                    movetext.Clear();
                }

                headers[header.Groups[1].Value] = header.Groups[2].Value.Replace("\\\"", "\"", StringComparison.Ordinal).Replace("\\\\", "\\", StringComparison.Ordinal);
                continue;
            }

            if (!string.IsNullOrWhiteSpace(line))
            {
                movetext.Append(line).Append('\n');
                commentDepth = Math.Max(0, commentDepth + CommentBalance(line, commentDepth > 0));
            }
        }

        if (movetext.Length > 0 || headers.Count > 0)
        {
            yield return new PgnGame(++index, headers, Tokens(movetext.ToString()));
        }
    }

    /// <summary>The main line in UCI, replayed from the standard start; the first move that does not replay is the error.</summary>
    public static (IReadOnlyList<string> Moves, string? Error) ToUci(IReadOnlyList<string> san)
    {
        ArgumentNullException.ThrowIfNull(san);
        ChessRules rules = ChessRules.ForStudy("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
            ?? throw new InvalidOperationException("The start position did not load.");
        List<string> moves = new(san.Count);
        for (int i = 0; i < san.Count; i++)
        {
            if (rules.TryApplySan(san[i].TrimEnd('!', '?')) is not MoveApplied applied)
            {
                return (moves, $"Illegal move {i + 1} ({san[i]}).");
            }

            moves.Add(applied.Uci);
        }

        return (moves, null);
    }

    /// <summary>How a line changes the <c>{…}</c> depth; a <c>;</c> outside a comment hides the rest of the line.</summary>
    private static int CommentBalance(string line, bool inComment)
    {
        int balance = 0;
        foreach (char c in line)
        {
            if (c == ';' && !inComment && balance == 0)
            {
                break;
            }

            if (c == '{')
            {
                balance++;
            }
            else if (c == '}')
            {
                balance--;
            }
        }

        return balance;
    }

    private static List<string> Tokens(string movetext)
    {
        List<string> san = [];
        StringBuilder token = new();
        int variation = 0;
        void Flush()
        {
            if (token.Length == 0)
            {
                return;
            }

            string text = MoveNumberPattern().Replace(token.ToString(), string.Empty);
            token.Clear();
            if (variation == 0 && text.Length > 0 && !Results.Contains(text, StringComparer.Ordinal))
            {
                san.Add(text);
            }
        }

        for (int i = 0; i < movetext.Length; i++)
        {
            char c = movetext[i];
            switch (c)
            {
                case '{':
                    Flush();
                    i = movetext.IndexOf('}', i) is var end and >= 0 ? end : movetext.Length;
                    break;
                case ';':
                    Flush();
                    i = movetext.IndexOf('\n', i) is var eol and >= 0 ? eol : movetext.Length;
                    break;
                case '(':
                    Flush();
                    variation++;
                    break;
                case ')':
                    Flush();
                    variation = Math.Max(0, variation - 1);
                    break;
                case '$':
                    Flush();
                    while (i + 1 < movetext.Length && char.IsAsciiDigit(movetext[i + 1]))
                    {
                        i++;
                    }

                    break;
                default:
                    if (char.IsWhiteSpace(c))
                    {
                        Flush();
                    }
                    else
                    {
                        token.Append(c);
                    }

                    break;
            }
        }

        Flush();
        return san;
    }

    [GeneratedRegex("""^\s*\[(\w+)\s+"(.*)"\s*\]\s*$""")]
    private static partial Regex HeaderPattern();

    /// <summary>A move number in front of or instead of a move: <c>12.</c>, <c>12...</c>, <c>1.e4</c>.</summary>
    [GeneratedRegex(@"^\d+\.+")]
    private static partial Regex MoveNumberPattern();
}
