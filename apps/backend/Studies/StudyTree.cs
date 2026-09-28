using Chess.Backend.Games;

namespace Chess.Backend.Studies;

/// <summary>A move as a client sends it: UCI only, and the moves that may follow it (the first one continues the line).</summary>
internal sealed record StudyMoveInput(string Uci, IReadOnlyList<StudyMoveInput>? Children = null);

/// <summary>
/// A move as a study stores it (studies D1): the server's own SAN and the position after it. <see cref="Children"/>'s
/// first entry continues the line; the others are variations.
/// </summary>
internal sealed record StudyMove(string Uci, string San, string Fen, IReadOnlyList<StudyMove> Children);

/// <summary>Why a tree was refused: the message, and the path of the bad move (child indexes from the top).</summary>
internal sealed record StudyTreeError(string Message, IReadOnlyList<int> Path);

/// <summary>
/// The referee of studies (studies D2): replays every line from the start position with <see cref="ChessRules"/> and
/// returns the tree with the server's SAN and FEN, or the first reason to refuse it. Nothing a client computed is kept.
/// </summary>
internal static class StudyTree
{
    public const string StandardStart = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    public const int MaxNodes = 2_000;
    public const int MaxDepth = 1_000;

    public static (IReadOnlyList<StudyMove>? Tree, StudyTreeError? Error) Validate(string startFen, IReadOnlyList<StudyMoveInput>? moves)
    {
        if (ChessRules.ForStudy(startFen) is null)
        {
            return (null, new StudyTreeError("The start position is not a valid FEN.", []));
        }

        moves ??= [];
        if (!WithinLimits(moves))
        {
            return (null, new StudyTreeError($"A study holds at most {MaxNodes} moves, {MaxDepth} deep.", []));
        }

        List<int> path = [];
        StudyTreeError? error = null;
        IReadOnlyList<StudyMove>? tree = Complete(startFen, moves, path, ref error);
        return error is null ? (tree, null) : (null, error);
    }

    /// <summary>The main line: the chain of first moves.</summary>
    public static IEnumerable<StudyMove> MainLine(IReadOnlyList<StudyMove> tree)
    {
        ArgumentNullException.ThrowIfNull(tree);
        for (IReadOnlyList<StudyMove> level = tree; level.Count > 0; level = level[0].Children)
        {
            yield return level[0];
        }
    }

    private static List<StudyMove>? Complete(string fen, IReadOnlyList<StudyMoveInput> moves, List<int> path, ref StudyTreeError? error)
    {
        List<StudyMove> done = new(moves.Count);
        for (int i = 0; i < moves.Count && error is null; i++)
        {
            path.Add(i);
            StudyMoveInput move = moves[i];
            // A fresh board per move from the position before it: no history is needed, and lines stay independent.
            if (ChessRules.ForStudy(fen)!.TryApply(move.Uci) is MoveApplied applied)
            {
                List<StudyMove>? children = Complete(applied.FenAfter, move.Children ?? [], path, ref error);
                if (children is not null)
                {
                    done.Add(new StudyMove(applied.Uci, applied.San, applied.FenAfter, children));
                }
            }
            else
            {
                error = new StudyTreeError($"The move {move.Uci} is not legal here.", [.. path]);
            }

            path.RemoveAt(path.Count - 1);
        }

        return error is null ? done : null;
    }

    /// <summary>True when the tree stays within <see cref="MaxNodes"/> and <see cref="MaxDepth"/>; stops walking once it does not.</summary>
    private static bool WithinLimits(IReadOnlyList<StudyMoveInput> moves)
    {
        int nodes = 0;
        Stack<(IReadOnlyList<StudyMoveInput> Moves, int Depth)> todo = new([(moves, 1)]);
        while (todo.TryPop(out (IReadOnlyList<StudyMoveInput> Moves, int Depth) level))
        {
            foreach (StudyMoveInput move in level.Moves)
            {
                if (++nodes > MaxNodes || level.Depth > MaxDepth)
                {
                    return false;
                }

                if (move.Children is { Count: > 0 } children)
                {
                    todo.Push((children, level.Depth + 1));
                }
            }
        }

        return true;
    }
}
