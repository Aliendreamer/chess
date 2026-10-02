using Chess.Backend.Games;

namespace Chess.Backend.Tests.Games;

public sealed class PlayerRecordTests
{
    [Fact]
    public void Results_count_from_the_players_side_in_total_and_per_time_control()
    {
        PlayerRecordTotals record = PlayerRecord.Count(
        [
            new ResultRow("white", "1-0", "3+2"),
            new ResultRow("black", "1/2-1/2", "3+2"),
            new ResultRow("black", "1-0", "10+5"),
            new ResultRow("black", "0-1", "10+5"),
        ]);

        Assert.Equal((2, 1, 1), (record.Wins, record.Draws, record.Losses));
        Assert.Equal(
            [new TimeControlRecord("10+5", 1, 0, 1), new TimeControlRecord("3+2", 1, 1, 0)],
            record.ByTimeControl);
    }

    [Fact]
    public void Aborted_and_unfinished_games_are_not_results()
    {
        PlayerRecordTotals record = PlayerRecord.Count([new ResultRow("white", "*", "5+0"), new ResultRow("white", null, "5+0")]);

        Assert.Equal((0, 0, 0), (record.Wins, record.Draws, record.Losses));
        Assert.Empty(record.ByTimeControl);
    }
}
