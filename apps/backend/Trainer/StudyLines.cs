using System.Security.Cryptography;
using System.Text;
using Chess.Backend.Analysis;
using Chess.Backend.Studies;

namespace Chess.Backend.Trainer;

/// <summary>A line of a study to drill: its key in <c>trainer_progress</c> and its moves from the study's start.</summary>
internal sealed record StudyLine(string Key, IReadOnlyList<string> Moves);

/// <summary>
/// A member's study as trainer lines (study-repertoire-trainer D1–D3), pure: every path from the start to a leaf, main
/// line first then variations in tree order, so several replies for either side are several lines. A path with no move
/// for the side drilled is skipped. A line's key is a hash of the start position and its moves, so it keeps its
/// progress wherever it moves in the tree and starts over when a move in it changes or it is extended.
/// </summary>
internal static class StudyLines
{
    public const string KeyPrefix = "study:";

    public static IReadOnlyList<StudyLine> Of(string startFen, IReadOnlyList<StudyMove> tree, string color)
    {
        ArgumentNullException.ThrowIfNull(startFen);
        ArgumentNullException.ThrowIfNull(tree);
        string start = PositionKey.Of(startFen) ?? throw new ArgumentException("Not a position.", nameof(startFen));
        // The side to move at the start plays the even plies of every path.
        bool memberFirst = (startFen.Split(' ') is [_, var side, ..] ? side : "w") == (color == "white" ? "w" : "b");
        List<StudyLine> lines = [];
        List<string> path = [];

        void Walk(IReadOnlyList<StudyMove> children)
        {
            foreach (StudyMove move in children)
            {
                path.Add(move.Uci);
                if (move.Children.Count == 0)
                {
                    if (path.Count > (memberFirst ? 0 : 1))
                    {
                        lines.Add(new StudyLine(Key(start, path), [.. path]));
                    }
                }
                else
                {
                    Walk(move.Children);
                }

                path.RemoveAt(path.Count - 1);
            }
        }

        Walk(tree);
        return lines;
    }

    private static string Key(string start, IEnumerable<string> moves) =>
        KeyPrefix + System.Buffers.Text.Base64Url.EncodeToString(SHA256.HashData(Encoding.UTF8.GetBytes($"{start} {string.Join(' ', moves)}")));
}
