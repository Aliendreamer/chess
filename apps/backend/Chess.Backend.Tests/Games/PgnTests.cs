using Chess.Backend.Games;

namespace Chess.Backend.Tests.Games;

public sealed class PgnTests
{
    private static PgnGame Game(string[] san, string result = "0-1", string reason = "Checkmate") => new(
        Site: "app.chess.localhost",
        StartedAt: Time.Utc("2026-09-26T10:00:00Z"),
        White: "testuser",
        Black: "player",
        TimeControl: "5+3",
        Result: result,
        Reason: reason,
        San: san);

    [Fact]
    public void Fools_mate_is_the_seven_tag_roster_plus_time_control_and_termination_then_movetext()
    {
        string pgn = Pgn.Build(Game(["f3", "e5", "g4", "Qh4#"]));

        Assert.Equal(
            """
            [Event "Live game"]
            [Site "app.chess.localhost"]
            [Date "2026.09.26"]
            [Round "-"]
            [White "testuser"]
            [Black "player"]
            [Result "0-1"]
            [TimeControl "300+3"]
            [Termination "normal"]

            1. f3 e5 2. g4 Qh4# 0-1

            """.ReplaceLineEndings("\n"),
            pgn);
    }

    [Fact]
    public void A_game_ending_on_whites_move_numbers_correctly() =>
        Assert.EndsWith("1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0\n", Pgn.Build(Game(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"], "1-0")), StringComparison.Ordinal);

    [Theory]
    [InlineData("1-0", "Timeout", "time forfeit")]
    [InlineData("1/2-1/2", "TimeoutVsInsufficientMaterial", "time forfeit")]
    [InlineData("*", "Aborted", "abandoned")]
    [InlineData("0-1", "Resignation", "normal")]
    [InlineData("1/2-1/2", "ThreefoldRepetition", "normal")]
    public void Termination_follows_the_end_reason(string result, string reason, string termination) =>
        Assert.Contains($"[Termination \"{termination}\"]", Pgn.Build(Game(["e4"], result, reason)), StringComparison.Ordinal);

    [Fact]
    public void An_aborted_game_with_no_moves_is_just_the_result()
    {
        string pgn = Pgn.Build(Game([], "*", "Aborted"));

        Assert.EndsWith("[Result \"*\"]\n[TimeControl \"300+3\"]\n[Termination \"abandoned\"]\n\n*\n", pgn, StringComparison.Ordinal);
    }

    [Fact]
    public void Movetext_wraps_before_80_columns_without_splitting_a_token()
    {
        string[] san = [.. Enumerable.Repeat(new[] { "Nf3", "Nf6", "Ng1", "Ng8" }, 12).SelectMany(x => x)];

        string[] movetext = Pgn.Build(Game(san, "1/2-1/2", "ThreefoldRepetition")).Split("\n\n")[1].TrimEnd('\n').Split('\n');

        Assert.All(movetext, line => Assert.InRange(line.Length, 1, 79));
        Assert.StartsWith("1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3", movetext[0], StringComparison.Ordinal);
        Assert.EndsWith("24. Ng1 Ng8 1/2-1/2", movetext[^1], StringComparison.Ordinal);
        Assert.True(movetext.Length > 1);
    }

    [Fact]
    public void Quotes_and_backslashes_in_names_are_escaped() =>
        Assert.Contains("[White \"a\\\"b\\\\c\"]", Pgn.Build(Game(["e4"]) with { White = "a\"b\\c" }), StringComparison.Ordinal);
}
