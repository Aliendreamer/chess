using Chess.Backend.Studies;
using Chess.Backend.Trainer;

namespace Chess.Backend.Tests.Trainer;

/// <summary>A study's lines for the trainer (study-repertoire-trainer D1–D3), pure.</summary>
public sealed class StudyLinesTests
{
    private const string Start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    private static StudyMoveInput M(string uci, params StudyMoveInput[] children) => new(uci, children);

    private static IReadOnlyList<StudyMove> Tree(string fen, params StudyMoveInput[] moves) =>
        StudyTree.Validate(fen, moves).Tree ?? throw new InvalidOperationException("not a legal tree");

    /// <summary>1.e4 e5 (1...c5 2.Nf3) 2.Nf3 Nc6 (2...Nf6): the Ruy main line with two replies for Black.</summary>
    private static readonly IReadOnlyList<StudyMove> Ruy = Tree(Start,
        M("e2e4",
            M("e7e5", M("g1f3", M("b8c6"), M("g8f6"))),
            M("c7c5", M("g1f3"))));

    [Fact]
    public void Every_path_to_a_leaf_is_a_line_main_line_first()
    {
        Assert.Equal(
            ["e2e4 e7e5 g1f3 b8c6", "e2e4 e7e5 g1f3 g8f6", "e2e4 c7c5 g1f3"],
            StudyLines.Of(Start, Ruy, "white").Select(l => string.Join(' ', l.Moves)));
    }

    [Fact]
    public void Member_side_alternatives_are_lines_too()
    {
        IReadOnlyList<StudyMove> tree = Tree(Start, M("e2e4", M("e7e5")), M("d2d4", M("d7d5")));

        Assert.Equal(["e2e4 e7e5", "d2d4 d7d5"], StudyLines.Of(Start, tree, "white").Select(l => string.Join(' ', l.Moves)));
    }

    [Fact]
    public void A_path_with_no_move_for_the_side_is_skipped()
    {
        IReadOnlyList<StudyMove> tree = Tree(Start, M("e2e4"), M("d2d4", M("d7d5")));

        Assert.Equal(["d2d4 d7d5"], StudyLines.Of(Start, tree, "black").Select(l => string.Join(' ', l.Moves)));
        Assert.Equal(2, StudyLines.Of(Start, tree, "white").Count);
    }

    [Fact]
    public void A_line_keeps_its_key_when_variations_move_and_gets_a_new_one_when_its_moves_change()
    {
        IReadOnlyList<StudyMove> promoted = Tree(Start,
            M("e2e4",
                M("c7c5", M("g1f3")),
                M("e7e5", M("g1f3", M("g8f6"), M("b8c6")))));
        IReadOnlyList<StudyMove> extended = Tree(Start,
            M("e2e4",
                M("e7e5", M("g1f3", M("b8c6", M("f1b5")), M("g8f6"))),
                M("c7c5", M("g1f3"))));

        Dictionary<string, string> before = StudyLines.Of(Start, Ruy, "white").ToDictionary(l => string.Join(' ', l.Moves), l => l.Key);
        Dictionary<string, string> after = StudyLines.Of(Start, promoted, "white").ToDictionary(l => string.Join(' ', l.Moves), l => l.Key);

        Assert.Equal(before, after);
        Assert.DoesNotContain(before["e2e4 e7e5 g1f3 b8c6"], StudyLines.Of(Start, extended, "white").Select(l => l.Key));
        Assert.All(before.Values, k => Assert.StartsWith("study:", k, StringComparison.Ordinal));
        Assert.All(before.Values, k => Assert.True(k.Length <= 100));
    }

    [Fact]
    public void The_same_moves_from_another_start_are_another_line()
    {
        const string AfterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
        IReadOnlyList<StudyMove> fromE4 = Tree(AfterE4, M("e7e5", M("g1f3")));

        StudyLine line = Assert.Single(StudyLines.Of(AfterE4, fromE4, "black"));

        Assert.Equal(["e7e5", "g1f3"], line.Moves);
        Assert.Empty(StudyLines.Of(AfterE4, Tree(AfterE4, M("e7e5")), "white"));
    }
}

public sealed class TrainerProgressModelTests
{
    [Fact]
    public void A_study_lines_progress_goes_with_its_study()
    {
        using ProjectDbContext db = TestDb.Create();
        Microsoft.EntityFrameworkCore.Metadata.IForeignKey fk = Assert.Single(
            db.Model.FindEntityType(typeof(TrainerProgress))!.GetForeignKeys(),
            f => f.PrincipalEntityType.ClrType == typeof(Study));

        Assert.Equal((nameof(TrainerProgress.StudyId), DeleteBehavior.Cascade), (fk.Properties.Single().Name, fk.DeleteBehavior));
    }
}
