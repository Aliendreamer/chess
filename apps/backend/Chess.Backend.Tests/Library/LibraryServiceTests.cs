using Chess.Backend.Library;
using Microsoft.Extensions.Logging.Abstractions;

namespace Chess.Backend.Tests.Library;

public sealed class LibraryServiceTests
{
    private static readonly ImportSource Source = new("PGN Mentor", "moves only (facts)", "test.pgn", WorldChampionship: false);

    private static ImportGame Game(string white, params string[] uci) =>
        new(white, "Black Player", "Event", null, null, "1900.??.??", "1-0", null, [.. uci], null);

    private static LibraryService Service(ProjectDbContext db) => new(db, TimeProvider.System, NullLogger<LibraryService>.Instance);

    [Fact]
    public async Task New_games_are_stored_with_their_positions_and_every_game_gets_an_outcome()
    {
        await using ProjectDbContext db = TestDb.Create();

        IReadOnlyList<ImportItem> items = await Service(db).ImportAsync(
            Source,
            [Game("A", "e2e4", "e7e5"), Game("B", "e2e4", "e7e4"), Game("C", "d2d4")],
            CancellationToken.None);

        Assert.Equal([ImportStatus.Imported, ImportStatus.Refused, ImportStatus.Imported], items.Select(i => i.Status));
        Assert.Equal([0, 1, 2], items.Select(i => i.Index));
        Assert.Contains("e7e4", items[1].Error, StringComparison.Ordinal);
        Assert.Equal(2, await db.LibraryGames.CountAsync());
        Assert.Equal(3, await db.LibraryPositions.CountAsync());
    }

    [Fact]
    public async Task A_game_already_in_the_library_or_twice_in_one_batch_is_a_duplicate()
    {
        await using ProjectDbContext db = TestDb.Create();
        await Service(db).ImportAsync(Source, [Game("A", "e2e4")], CancellationToken.None);

        IReadOnlyList<ImportItem> items = await Service(db).ImportAsync(
            Source,
            [Game("a", "e2e4"), Game("B", "d2d4"), Game("B", "d2d4")],
            CancellationToken.None);

        Assert.Equal([ImportStatus.Duplicate, ImportStatus.Imported, ImportStatus.Duplicate], items.Select(i => i.Status));
        Assert.Equal(2, await db.LibraryGames.CountAsync());
    }
}
