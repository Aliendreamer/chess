using Chess.Backend.Library;

namespace Chess.Backend.Tests.Library;

/// <summary>The PGN reader (broadcast-explorer D3): one game at a time, headers and SAN, everything else skipped.</summary>
public sealed class PgnReaderTests
{
    private const string TwoGames = """
        [Event "Round 6: Postny - Bjerre"]
        [White "Postny, Evgeny"]
        [Black "Bjerre, Jonas Buhl"]
        [Result "1-0"]
        [BroadcastName "Xtracon Open 2026"]

        1. e4 { [%eval 0.19] [%clk 1:28:26] } 1... c5 { [%clk 1:29:50] } 2. Nf3!? ( 2. c3 d5 ( 2... Nf6 ) ) d6 $1
        ; a comment to the end of the line
        3. d4 cxd4 { a comment
        over two lines } 4. Nxd4 1-0

        [Event "Round 6: Other"]
        [White "C"]
        [Black "D"]
        [Result "*"]

        1. d4 *
        """;

    private static async Task<List<PgnGame>> ReadAll(string text)
    {
        List<PgnGame> games = [];
        await foreach (PgnGame game in PgnReader.ReadAsync(new StringReader(text), CancellationToken.None))
        {
            games.Add(game);
        }

        return games;
    }

    [Fact]
    public async Task Headers_and_the_main_line_are_read_and_comments_variations_and_nags_skipped()
    {
        List<PgnGame> games = await ReadAll(TwoGames);

        Assert.Equal(2, games.Count);
        Assert.Equal(("Postny, Evgeny", "Xtracon Open 2026", "1-0"), (games[0].Headers["White"], games[0].Headers["BroadcastName"], games[0].Headers["Result"]));
        Assert.Equal(["e4", "c5", "Nf3!?", "d6", "d4", "cxd4", "Nxd4"], games[0].San);
        Assert.Equal((1, 2), (games[0].Index, games[1].Index));
        Assert.Equal(["d4"], games[1].San);
    }

    [Fact]
    public void San_is_replayed_into_uci()
    {
        Assert.Equal(["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4"], PgnReader.ToUci(["e4", "c5", "Nf3!?", "d6", "d4", "cxd4", "Nxd4"]).Moves);
        Assert.Equal(["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"], PgnReader.ToUci(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"]).Moves);
    }

    [Fact]
    public async Task An_illegal_move_refuses_that_game_and_the_next_still_reads()
    {
        List<PgnGame> games = await ReadAll(TwoGames.Replace("cxd4", "cxd5", StringComparison.Ordinal));

        (IReadOnlyList<string> _, string? error) = PgnReader.ToUci(games[0].San);

        Assert.Contains("cxd5", error, StringComparison.Ordinal);
        Assert.Null(PgnReader.ToUci(games[1].San).Error);
    }
}
