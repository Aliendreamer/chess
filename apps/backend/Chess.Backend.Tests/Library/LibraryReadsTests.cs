using Chess.Backend.Analysis;
using Chess.Backend.Games;
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

    private static readonly ImportSource Mentor = new("PGN Mentor", "moves only (facts)", null, WorldChampionship: true);

    /// <summary>Stores games as the import would (rows and positions) and returns the database.</summary>
    private static readonly ImportSource Lichess = new(BroadcastFilter.Source, BroadcastFilter.Licence, null, WorldChampionship: false);

    private static Task<ProjectDbContext> Library(params (string Result, string[] Moves)[] games) =>
        Library([.. games.Select(g => (Mentor, g.Result, g.Moves))]);

    private static async Task<ProjectDbContext> Library(IEnumerable<(ImportSource Source, string Result, string[] Moves)> games)
    {
        ProjectDbContext db = TestDb.Create();
        foreach ((ImportSource source, string result, string[] moves) in games)
        {
            ImportGame game = new("W", "B", null, null, null, null, result, null, moves, null);
            PreparedGame prepared = Assert.IsType<PreparedGame>(LibraryImport.Prepare(game, source, new Dictionary<string, Opening>(), DateTimeOffset.UnixEpoch));
            db.LibraryGames.Add(prepared.Game);
            db.LibraryPositions.AddRange(prepared.Positions);
        }

        await db.SaveChangesAsync();
        return db;
    }

    private static string KeyAfter(params string[] moves) => PositionKey.Of(ChessRules.Replay(moves).Fen)!;

    [Fact]
    public async Task Explore_groups_the_next_moves_with_their_results_most_played_first()
    {
        using ProjectDbContext db = await Library(
            ("1-0", ["e2e4", "e7e5"]),
            ("1/2-1/2", ["e2e4", "e7e5"]),
            ("0-1", ["e2e4", "c7c5"]),
            ("1-0", ["e2e4"])); // ends here: counted, but no next move

        (PositionCounts counts, IReadOnlyList<ExplorerMove> moves) = await LibraryReads.ExploreAsync(db.LibraryPositions, KeyAfter("e2e4"), LibrarySource.All, CancellationToken.None);

        Assert.Equal((4, 2, 1, 1), (counts.Games, counts.WhiteWins, counts.Draws, counts.BlackWins));
        Assert.Equal([new ExplorerMove("e7e5", 2, 1, 1, 0), new ExplorerMove("c7c5", 1, 0, 0, 1)], moves);
    }

    [Fact]
    public async Task From_the_start_every_first_move_counts()
    {
        using ProjectDbContext db = await Library(("1-0", ["d2d4"]), ("0-1", ["e2e4"]), ("*", ["e2e4"]));

        (PositionCounts counts, IReadOnlyList<ExplorerMove> moves) = await LibraryReads.ExploreAsync(db.LibraryPositions, KeyAfter(), LibrarySource.All, CancellationToken.None);

        Assert.Equal(3, counts.Games);
        Assert.Equal([("e2e4", 2), ("d2d4", 1)], moves.Select(m => (m.Uci, m.Games)));
    }

    [Fact]
    public async Task A_repetition_counts_once_with_the_move_played_at_the_first_visit()
    {
        // Knights out and back: the start position again at ply 4, then 1.e4 from there.
        using ProjectDbContext db = await Library(("1-0", ["g1f3", "g8f6", "f3g1", "f6g8", "e2e4"]));

        (PositionCounts counts, IReadOnlyList<ExplorerMove> moves) = await LibraryReads.ExploreAsync(db.LibraryPositions, KeyAfter(), LibrarySource.All, CancellationToken.None);

        Assert.Equal(1, counts.Games);
        Assert.Equal([new ExplorerMove("g1f3", 1, 1, 0, 0)], moves);
    }

    [Fact]
    public async Task The_games_at_a_position_newest_year_first_with_the_ply_of_their_first_visit()
    {
        using ProjectDbContext db = await Library(("1-0", ["e2e4", "e7e5"]), ("0-1", ["g1f3", "g8f6", "f3g1", "f6g8"]));
        foreach ((LibraryGame game, int year) in db.LibraryGames.AsEnumerable().Zip([1990, 2020]))
        {
            game.Year = year;
        }

        await db.SaveChangesAsync();

        List<(int? Year, int Ply)> games = [.. (await LibraryReads.GamesAtAsync(db.LibraryPositions, db.LibraryGames, KeyAfter(), LibrarySource.All, 50, CancellationToken.None))
            .Select(g => (g.Game.Year, g.Ply))];

        Assert.Equal([(2020, 0), (1990, 0)], games);
    }

    [Theory]
    [InlineData("all", 3)]
    [InlineData("wc", 1)]
    [InlineData("broadcasts", 2)]
    public async Task The_explorer_counts_one_source_or_all(string query, int games)
    {
        Assert.True(LibrarySources.TryParse(query, out LibrarySource source));
        using ProjectDbContext db = await Library([(Mentor, "1-0", ["e2e4", "e7e5"]), (Lichess, "0-1", ["e2e4", "c7c5"]), (Lichess, "1-0", ["e2e4", "e7e5"])]);

        (PositionCounts counts, _) = await LibraryReads.ExploreAsync(db.LibraryPositions, KeyAfter("e2e4"), source, CancellationToken.None);
        IReadOnlyList<GameAtPosition> listed = await LibraryReads.GamesAtAsync(db.LibraryPositions, db.LibraryGames, KeyAfter("e2e4"), source, 50, CancellationToken.None);

        Assert.Equal((games, games), (counts.Games, listed.Count));
    }

    [Fact]
    public async Task The_search_filters_by_source()
    {
        using ProjectDbContext db = await Library([(Mentor, "1-0", ["e2e4"]), (Lichess, "0-1", ["d2d4"])]);

        Assert.Equal(BroadcastFilter.Source, Assert.Single(LibraryReads.Filter(db.LibraryGames, new LibrarySearch(Source: LibrarySource.Broadcasts))).Source);
        Assert.Equal("PGN Mentor", Assert.Single(LibraryReads.Filter(db.LibraryGames, new LibrarySearch(Source: LibrarySource.Wc))).Source);
        Assert.Equal(2, LibraryReads.Filter(db.LibraryGames, new LibrarySearch()).Count());
    }

    [Theory]
    [InlineData(null, "All")]
    [InlineData("all", "All")]
    [InlineData("wc", "Wc")]
    [InlineData("broadcasts", "Broadcasts")]
    public void Sources_are_read_from_the_query(string? text, string expected)
    {
        Assert.True(LibrarySources.TryParse(text, out LibrarySource source));
        Assert.Equal(expected, source.ToString());
        Assert.False(LibrarySources.TryParse("everything", out _));
    }
}

