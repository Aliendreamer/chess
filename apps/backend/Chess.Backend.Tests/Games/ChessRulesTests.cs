using Chess.Backend.Games;

namespace Chess.Backend.Tests.Games;

public sealed class ChessRulesTests
{
    private const string FoolsMate = "f2f3 e7e5 g2g4 d8h4";

    /// <summary>Sam Loyd's 10-move stalemate.</summary>
    private const string Stalemate = "e2e3 a7a5 d1h5 a8a6 h5a5 h7h5 h2h4 a6h6 a5c7 f7f6 c7d7 e8f7 d7b7 d8d3 b7b8 d3h7 b8c8 f7g6 c8e6";

    private const string KnightShuffle = "g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8";

    private static MoveApplied Play(ChessRules rules, string uci) => rules.TryApply(uci) switch
    {
        MoveApplied applied => applied,
        MoveRejected rejected => throw new Xunit.Sdk.XunitException($"{uci} rejected after [{string.Join(' ', rules.Moves)}]: {rejected.Reason}"),
        _ => throw new InvalidOperationException(),
    };

    /// <summary>Plays every move in order. A loop on purpose: <c>Select(...).Last()</c> over an array skips straight
    /// to the last element and never plays the others.</summary>
    private static MoveApplied PlayAll(ChessRules rules, string line)
    {
        MoveApplied? last = null;
        foreach (string uci in line.Split(' '))
        {
            last = Play(rules, uci);
        }

        return last!;
    }

    [Fact]
    public void A_legal_move_gives_san_the_new_position_and_passes_the_turn()
    {
        ChessRules rules = ChessRules.NewGame();

        MoveApplied e4 = Play(rules, "e2e4");

        Assert.Equal(("e2e4", "e4"), (e4.Uci, e4.San));
        Assert.StartsWith("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b ", e4.FenAfter, StringComparison.Ordinal);
        Assert.Equal(Side.Black, rules.SideToMove);
        Assert.Null(e4.End);
        Assert.Equal(["e2e4"], rules.Moves);
    }

    [Theory]
    [InlineData("e2e5")] // illegal
    [InlineData("e7e5")] // not White's piece
    [InlineData("e2")] // malformed
    [InlineData("e2e4x")] // bad promotion char
    [InlineData("E2E4")] // UCI is lower case
    public void Illegal_or_malformed_moves_are_rejected_and_change_nothing(string uci)
    {
        ChessRules rules = ChessRules.NewGame();

        MoveRejected rejected = Assert.IsType<MoveRejected>(rules.TryApply(uci));

        Assert.False(string.IsNullOrWhiteSpace(rejected.Reason));
        Assert.Equal(Side.White, rules.SideToMove);
        Assert.Empty(rules.Moves);
    }

    [Fact]
    public void Checkmate_ends_the_game_for_the_mating_side_with_a_mate_mark()
    {
        MoveApplied last = PlayAll(ChessRules.NewGame(), FoolsMate);

        Assert.Equal("Qh4#", last.San);
        Assert.Equal(new GameOutcome(GameResult.BlackWins, EndReason.Checkmate), last.End);
    }

    [Fact]
    public void Stalemate_is_a_draw_and_the_san_carries_no_library_suffix()
    {
        MoveApplied last = PlayAll(ChessRules.NewGame(), Stalemate);

        Assert.Equal("Qe6", last.San); // Gera writes "Qe6$" — not SAN
        Assert.Equal(new GameOutcome(GameResult.Draw, EndReason.Stalemate), last.End);
    }

    [Fact]
    public void Threefold_repetition_is_a_draw_even_when_the_first_half_was_replayed()
    {
        string[] moves = KnightShuffle.Split(' ');
        ChessRules rules = ChessRules.Replay(moves[..4]); // as after recovery from a snapshot

        MoveApplied last = PlayAll(rules, string.Join(' ', moves[4..]));

        Assert.Equal(new GameOutcome(GameResult.Draw, EndReason.ThreefoldRepetition), last.End);
    }

    [Fact]
    public void Promotion_takes_the_requested_piece_and_requires_one()
    {
        ChessRules missing = ChessRules.FromFen("8/P6k/8/8/8/8/8/K7 w - - 0 1");
        Assert.IsType<MoveRejected>(missing.TryApply("a7a8"));

        ChessRules rules = ChessRules.FromFen("8/P6k/8/8/8/8/8/K7 w - - 0 1");
        MoveApplied promoted = Play(rules, "a7a8n");

        Assert.Equal("a8=N", promoted.San);
        Assert.StartsWith("N7/", promoted.FenAfter, StringComparison.Ordinal);
    }

    [Fact]
    public void A_promotion_piece_on_a_non_promoting_move_is_rejected() =>
        Assert.IsType<MoveRejected>(ChessRules.NewGame().TryApply("e2e4q"));

    [Fact]
    public void Castling_and_en_passant_are_legal_moves()
    {
        ChessRules castle = ChessRules.FromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
        Assert.Equal("O-O", Play(castle, "e1g1").San);

        ChessRules ep = ChessRules.NewGame();
        PlayAll(ep, "e2e4 a7a6 e4e5 d7d5");
        Assert.Equal("exd6", Play(ep, "e5d6").San);
    }

    [Fact]
    public void Replay_rejects_a_move_list_with_an_illegal_entry() =>
        Assert.Throws<InvalidOperationException>(() => ChessRules.Replay(["e2e4", "e2e4"]));

    [Fact]
    public void The_game_can_be_exported_as_pgn_movetext() =>
        Assert.StartsWith("1. f3 e5 2. g4 Qh4#", ChessRules.Replay(FoolsMate.Split(' ')).ToPgnMovetext(), StringComparison.Ordinal);
}

public sealed class SideCanMateTests
{
    [Theory]
    [InlineData("8/8/8/8/8/5k2/8/K7 w - - 0 1", "White", false)] // lone king
    [InlineData("8/8/8/8/8/5k2/8/K5N1 b - - 0 1", "White", false)] // king + knight
    [InlineData("8/8/8/8/8/5k2/8/K5B1 b - - 0 1", "White", false)] // king + bishop
    [InlineData("8/8/8/8/8/5k2/8/K5R1 b - - 0 1", "White", true)] // king + rook
    [InlineData("8/8/8/8/8/5k2/8/K4BB1 b - - 0 1", "White", true)] // two bishops
    [InlineData("8/8/8/8/8/5k2/8/K4NN1 b - - 0 1", "White", true)] // two knights: mate exists, so no draw
    [InlineData("8/8/8/8/8/5k2/P7/K7 b - - 0 1", "White", true)] // a pawn can promote
    [InlineData("8/8/8/8/8/5k2/P7/K7 b - - 0 1", "Black", false)] // Black: lone king
    public void Mating_material_by_side(string fen, string side, bool canMate) =>
        Assert.Equal(canMate, ChessRules.FromFen(fen).CanMate(Enum.Parse<Side>(side)));
}
