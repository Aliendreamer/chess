using Chess.Backend.Analysis;
using Chess.Backend.Games;
using Chess.Backend.Library;

namespace Chess.Backend.Tests.Library;

public sealed class OpeningSeedTests
{
    [Fact]
    public void A_row_is_replayed_to_its_position()
    {
        Opening berlin = OpeningSeed.Parse("C67", "Ruy Lopez: Berlin Defense", "1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O")!;

        ChessRules rules = ChessRules.Replay(["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "g8f6", "e1g1"]);
        Assert.Equal((PositionKey.Of(rules.Fen), "C67", "Ruy Lopez: Berlin Defense", 7), (berlin.PositionKey, berlin.Eco, berlin.Name, berlin.Ply));
    }

    [Fact]
    public void A_row_that_does_not_replay_is_skipped()
    {
        Assert.Null(OpeningSeed.Parse("A00", "Nonsense", "1. e5"));
        Assert.Null(OpeningSeed.Parse("A00", "Empty", ""));
    }

    [Fact]
    public void The_embedded_list_names_thousands_of_positions_once_each()
    {
        List<Opening> all = [.. OpeningSeed.ReadEmbedded()];

        Assert.True(all.Count > 3000, $"only {all.Count}");
        Assert.Equal(all.Count, all.Select(o => o.PositionKey).Distinct(StringComparer.Ordinal).Count());
        Assert.Contains(all, o => o.Eco == "B20" && o.Name == "Sicilian Defense");
    }
}
