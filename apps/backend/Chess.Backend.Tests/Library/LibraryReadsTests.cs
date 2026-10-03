using Chess.Backend.Library;

namespace Chess.Backend.Tests.Library;

public sealed class LibraryReadsTests
{
    private static LibraryGame Game(int? year, string result = "1-0", bool wc = false, string? eco = null) => new()
    {
        Id = Guid.CreateVersion7(),
        White = "W",
        Black = "B",
        Year = year,
        Result = result,
        WorldChampionship = wc,
        Eco = eco,
        MovesUci = ["e2e4"],
        Ply = 1,
        Source = "test",
        Licence = "test",
        DedupeKey = Guid.NewGuid().ToString("N"),
    };

    private static List<LibraryGame> Run(IEnumerable<LibraryGame> games, LibrarySearch search, LibraryCursor? after = null, int limit = 50) =>
        [.. LibraryReads.Filter(games.AsQueryable(), search with { Player = null, Event = null, Opening = null }).NewestYearFirst(after, limit)];

    [Fact]
    public void Newest_year_first_and_games_without_a_year_last()
    {
        LibraryGame old = Game(1886), recent = Game(1972), undated = Game(null);

        Assert.Equal([recent.Id, old.Id, undated.Id], Run([old, undated, recent], new LibrarySearch()).Select(g => g.Id));
    }

    [Fact]
    public void Years_world_championship_result_and_eco_filter()
    {
        LibraryGame a = Game(1972, "1-0", wc: true, eco: "C67"), b = Game(1985, "1/2-1/2", wc: true, eco: "B20"), c = Game(1990, "1-0", eco: "C67");

        Assert.Equal([b.Id, a.Id], Run([a, b, c], new LibrarySearch(From: 1970, To: 1989)).Select(g => g.Id));
        Assert.Equal([b.Id, a.Id], Run([a, b, c], new LibrarySearch(WorldChampionship: true)).Select(g => g.Id));
        Assert.Equal([b.Id], Run([a, b, c], new LibrarySearch(Result: "1/2-1/2")).Select(g => g.Id));
        Assert.Equal([c.Id, a.Id], Run([a, b, c], new LibrarySearch(Eco: "C67")).Select(g => g.Id));
        Assert.Equal([c.Id, a.Id], Run([a, b, c], new LibrarySearch(Eco: "C6")).Select(g => g.Id)); // a prefix: C60–C69
    }

    [Fact]
    public void Pages_follow_the_cursor_without_repeating_a_game()
    {
        List<LibraryGame> games = [Game(1900), Game(1900), Game(1900), Game(null), Game(1950)];
        List<Guid> walked = [];
        LibraryCursor? cursor = null;
        do
        {
            List<LibraryGame> page = Run(games, new LibrarySearch(), cursor, limit: 2);
            walked.AddRange(page.Take(2).Select(g => g.Id));
            cursor = page.Count > 2 ? LibraryCursor.After(page[1]) : null;
        }
        while (cursor is not null);

        Assert.Equal(games.Count, walked.Count);
        Assert.Equal(walked.Count, walked.Distinct().Count());
    }

    [Fact]
    public void A_cursor_survives_its_text_form_and_rubbish_is_refused()
    {
        LibraryCursor cursor = LibraryCursor.After(Game(1972));

        Assert.True(LibraryCursor.TryDecode(cursor.Encode(), out LibraryCursor? back));
        Assert.Equal(cursor, back);
        Assert.False(LibraryCursor.TryDecode("rubbish", out _));
        Assert.True(LibraryCursor.TryDecode(null, out LibraryCursor? none));
        Assert.Null(none);
    }

    [Fact]
    public void Counts_at_a_position_split_by_result()
    {
        PositionCounts counts = LibraryReads.Count(["1-0", "1-0", "1/2-1/2", "0-1", "*"]);

        Assert.Equal((5, 2, 1, 1), (counts.Games, counts.WhiteWins, counts.Draws, counts.BlackWins));
    }

    [Fact]
    public void Explore_groups_the_next_moves_with_their_results_most_played_first()
    {
        string[] e4e5 = ["e2e4", "e7e5"], e4c5 = ["e2e4", "c7c5"];
        List<ExplorerMove> moves = [.. LibraryReads.Explore(
        [
            new GameAtPosition(e4e5, 1, "1-0"),
            new GameAtPosition(e4e5, 1, "1/2-1/2"),
            new GameAtPosition(e4c5, 1, "0-1"),
            new GameAtPosition(["e2e4"], 1, "1-0"), // ends here: no next move
        ])];

        Assert.Equal(
            [new ExplorerMove("e7e5", 2, 1, 1, 0), new ExplorerMove("c7c5", 1, 0, 0, 1)],
            moves);
    }

    [Fact]
    public void From_the_start_every_first_move_counts()
    {
        List<ExplorerMove> moves = [.. LibraryReads.Explore(
        [
            new GameAtPosition(["d2d4"], 0, "1-0"),
            new GameAtPosition(["e2e4"], 0, "0-1"),
            new GameAtPosition(["e2e4"], 0, "*"),
        ])];

        Assert.Equal(["e2e4", "d2d4"], moves.Select(m => m.Uci));
        Assert.Equal(2, moves[0].Games);
    }
}

