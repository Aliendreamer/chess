using Chess.Backend.Analysis;
using Chess.Backend.Games;
using Chess.Backend.Library;

namespace Chess.Backend.Tests.Library;

public sealed class LibraryImportTests
{
    private static readonly DateTimeOffset Now = Time.Utc("2026-10-02T12:00:00Z");

    private static readonly ImportSource Source = new("PGN Mentor", "moves only (facts)", "WorldChamp1972.pgn", WorldChampionship: true);

    /// <summary>The positions after 1.e4 e5 2.Nf3 named, as the seed would.</summary>
    private static readonly Dictionary<string, Opening> Openings = new[]
    {
        OpeningSeed.Parse("C20", "King's Pawn Game", "1. e4 e5")!,
        OpeningSeed.Parse("C40", "King's Knight Opening", "1. e4 e5 2. Nf3")!,
    }.ToDictionary(o => o.PositionKey, StringComparer.Ordinal);

    private static ImportGame Game(params string[] uci) => new(
        White: "Fischer, Robert James",
        Black: "Spassky, Boris V",
        Event: "World Championship 28th",
        Site: "Reykjavik",
        Round: "6",
        Date: "1972.07.23",
        Result: "1-0",
        Eco: null,
        Moves: [.. uci],
        StartFen: null);

    [Fact]
    public void A_legal_game_keeps_every_position_and_its_deepest_opening()
    {
        PreparedGame game = Assert.IsType<PreparedGame>(LibraryImport.Prepare(Game("e2e4", "e7e5", "g1f3", "b8c6"), Source, Openings, Now));

        Assert.Equal(("Fischer, Robert James", "Spassky, Boris V", 1972, "1972.07.23", 4, true), (game.Game.White, game.Game.Black, game.Game.Year, game.Game.DateText, game.Game.Ply, game.Game.WorldChampionship));
        Assert.Equal(("C40", "King's Knight Opening"), (game.Game.Eco, game.Game.OpeningName));
        Assert.Equal([1, 2, 3, 4], game.Positions.Select(p => p.Ply));
        Assert.Equal(PositionKey.Of(ChessRules.Replay(["e2e4", "e7e5", "g1f3", "b8c6"]).Fen), game.Positions[^1].PositionKey);
        Assert.All(game.Positions, p => Assert.Equal(game.Game.Id, p.GameId));
        Assert.Equal(("PGN Mentor", "moves only (facts)", "WorldChamp1972.pgn"), (game.Game.Source, game.Game.Licence, game.Game.SourceRef));
    }

    [Fact]
    public void The_games_own_eco_wins_over_the_list()
    {
        PreparedGame game = Assert.IsType<PreparedGame>(LibraryImport.Prepare(Game("e2e4", "e7e5", "g1f3") with { Eco = "C41" }, Source, Openings, Now));

        Assert.Equal(("C41", "King's Knight Opening"), (game.Game.Eco, game.Game.OpeningName));
    }

    [Fact]
    public void An_illegal_move_refuses_the_game_naming_the_move()
    {
        RefusedGame refused = Assert.IsType<RefusedGame>(LibraryImport.Prepare(Game("e2e4", "e7e4"), Source, Openings, Now));

        Assert.Contains("move 2 (e7e4)", refused.Error, StringComparison.Ordinal);
    }

    [Fact]
    public void A_game_from_another_position_or_without_moves_is_refused()
    {
        Assert.IsType<RefusedGame>(LibraryImport.Prepare(Game("e2e4") with { StartFen = "8/8/8/8/8/8/k7/4K3 w - - 0 1" }, Source, Openings, Now));
        Assert.IsType<RefusedGame>(LibraryImport.Prepare(Game(), Source, Openings, Now));
        Assert.IsType<RefusedGame>(LibraryImport.Prepare(Game("e2e4") with { White = " " }, Source, Openings, Now));
    }

    [Theory]
    [InlineData("1886.??.??", 1886)]
    [InlineData("1972.07.11", 1972)]
    [InlineData("????.??.??", null)]
    [InlineData(null, null)]
    public void The_year_comes_from_a_partial_date(string? date, int? year) => Assert.Equal(year, LibraryImport.YearOf(date));

    [Fact]
    public void The_same_game_has_one_key_whatever_the_spelling_of_its_players()
    {
        string a = LibraryImport.DedupeKey("Fischer, Robert James", "Spassky,  Boris V", 1972, ["e2e4", "e7e5"]);
        string b = LibraryImport.DedupeKey(" fischer, robert james", "SPASSKY, BORIS V", 1972, ["e2e4", "e7e5"]);
        string other = LibraryImport.DedupeKey("Fischer, Robert James", "Spassky, Boris V", 1972, ["e2e4", "c7c5"]);

        Assert.Equal(a, b);
        Assert.NotEqual(a, other);
    }
}
