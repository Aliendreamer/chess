using Chess.Backend.Games;
using Chess.Backend.Studies;

namespace Chess.Backend.Tests.Studies;

public sealed class StudyTreeTests
{
    private static StudyMoveInput M(string uci, params StudyMoveInput[] children) => new(uci, children);

    /// <summary>1.e4 e5 (1...c5 2.Nf3) 2.Nf3 Nc6 (2...d6).</summary>
    private static readonly StudyMoveInput[] Ruy =
    [
        M("e2e4", M("e7e5", M("g1f3", M("b8c6"), M("d7d6"))), M("c7c5", M("g1f3"))),
    ];

    [Fact]
    public void A_legal_tree_comes_back_with_the_servers_san_and_fen()
    {
        (IReadOnlyList<StudyMove>? tree, StudyTreeError? error) = StudyTree.Validate(ChessRules.StartFen, Ruy);

        Assert.Null(error);
        Assert.Equal(["e4", "e5", "Nf3", "Nc6"], StudyTree.MainLine(tree!).Select(m => m.San));
        StudyMove sicilian = tree![0].Children[1];
        Assert.Equal(("c5", "Nf3"), (sicilian.San, sicilian.Children[0].San));
        Assert.Equal("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2", tree[0].Children[0].Fen);
    }

    [Fact]
    public void An_illegal_move_in_a_variation_is_refused_with_its_path()
    {
        StudyMoveInput[] bad = [M("e2e4", M("e7e5"), M("e8e6"))];

        (IReadOnlyList<StudyMove>? tree, StudyTreeError? error) = StudyTree.Validate(ChessRules.StartFen, bad);

        Assert.Null(tree);
        Assert.Equal([0, 1], error!.Path);
        Assert.Contains("e8e6", error.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("not a fen")]
    [InlineData("")]
    public void A_start_that_is_not_a_position_is_refused(string fen) =>
        Assert.NotNull(StudyTree.Validate(fen, Ruy).Error);

    [Fact]
    public void A_custom_start_position_is_honoured()
    {
        const string KingAndPawn = "8/8/8/4k3/8/8/4P3/4K3 w - - 0 40";

        (IReadOnlyList<StudyMove>? tree, _) = StudyTree.Validate(KingAndPawn, [M("e2e4", M("e5e4"))]);

        Assert.Equal(("e4", "Kxe4"), (tree![0].San, tree[0].Children[0].San));
    }

    [Fact]
    public void A_line_may_repeat_positions_in_a_study()
    {
        // Threefold repetition ends a game, but not a line of study.
        StudyMoveInput knights = M("g1f3", M("g8f6", M("f3g1", M("f6g8", M("g1f3", M("g8f6", M("f3g1", M("f6g8", M("g1f3")))))))));

        Assert.Null(StudyTree.Validate(ChessRules.StartFen, [knights]).Error);
    }

    [Fact]
    public void Too_many_moves_are_refused()
    {
        StudyMoveInput[] wide = [.. Enumerable.Range(0, StudyTree.MaxNodes + 1).Select(_ => M("e2e4"))];

        Assert.Contains("at most", StudyTree.Validate(ChessRules.StartFen, wide).Error!.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void An_empty_study_is_fine() =>
        Assert.Empty(StudyTree.Validate(ChessRules.StartFen, []).Tree!);
}

public sealed class StudyPgnTests
{
    private static IReadOnlyList<StudyMove> Tree(string fen, params StudyMoveInput[] moves) => StudyTree.Validate(fen, moves).Tree!;

    private static StudyMoveInput M(string uci, params StudyMoveInput[] children) => new(uci, children);

    [Fact]
    public void Variations_follow_the_move_they_replace_and_black_moves_are_numbered_after_them()
    {
        IReadOnlyList<StudyMove> tree = Tree(ChessRules.StartFen, M("e2e4", M("e7e5", M("g1f3", M("b8c6"), M("d7d6"))), M("c7c5", M("g1f3"))));

        string pgn = StudyPgn.Build("Ruy ideas", new StudyHeaders("ann", "bob", "1-0", "2026.09.28"), ChessRules.StartFen, tree);

        Assert.Equal(
            """
            [Event "Ruy ideas"]
            [Site "chess"]
            [Date "2026.09.28"]
            [Round "-"]
            [White "ann"]
            [Black "bob"]
            [Result "1-0"]

            1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 (2... d6) 1-0

            """.ReplaceLineEndings("\n"),
            pgn);
    }

    [Fact]
    public void A_custom_start_writes_setup_and_fen_and_unknowns_as_pgn_does()
    {
        const string Start = "8/8/8/4k3/8/8/4P3/4K3 b - - 0 40";

        string pgn = StudyPgn.Build("Endgame \"lesson\"", new StudyHeaders(), Start, Tree(Start, M("e5e4")));

        Assert.Contains("[Event \"Endgame \\\"lesson\\\"\"]", pgn, StringComparison.Ordinal);
        Assert.Contains("[White \"?\"]\n[Black \"?\"]\n[Result \"*\"]\n[SetUp \"1\"]\n[FEN \"8/8/8/4k3/8/8/4P3/4K3 b - - 0 40\"]", pgn, StringComparison.Ordinal);
        Assert.EndsWith("\n40... Ke4 *\n", pgn, StringComparison.Ordinal);
    }
}
