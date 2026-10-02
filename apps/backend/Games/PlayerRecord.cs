using Chess.Backend.Data.ReadModels;

namespace Chess.Backend.Games;

/// <summary>One finished game from a player's side: their colour, the PGN result, the time control.</summary>
internal sealed record ResultRow(string Color, string? Result, string TimeControl);

internal sealed record TimeControlRecord(string TimeControl, int Wins, int Draws, int Losses);

internal sealed record PlayerRecordTotals(int Wins, int Draws, int Losses, IReadOnlyList<TimeControlRecord> ByTimeControl);

/// <summary>
/// A player's record (player-profiles): wins, draws and losses in total and per time control. An aborted game
/// (<c>*</c>) or one still being played is not a result. The browser groups time controls into game types.
/// </summary>
internal static class PlayerRecord
{
    public static PlayerRecordTotals Count(IEnumerable<ResultRow> rows)
    {
        ArgumentNullException.ThrowIfNull(rows);
        List<TimeControlRecord> byTc = [.. rows
            .Select(r => (r.TimeControl, Score: Score(r)))
            .Where(r => r.Score is not null)
            .GroupBy(r => r.TimeControl, StringComparer.Ordinal)
            .Select(g => new TimeControlRecord(g.Key, g.Count(r => r.Score == 1), g.Count(r => r.Score == 0), g.Count(r => r.Score == -1)))
            .OrderBy(r => r.TimeControl, StringComparer.Ordinal)];
        return new(byTc.Sum(r => r.Wins), byTc.Sum(r => r.Draws), byTc.Sum(r => r.Losses), byTc);
    }

    /// <summary>1 a win, 0 a draw, −1 a loss for the player of <see cref="ResultRow.Color"/>; null when not a result.</summary>
    private static int? Score(ResultRow r) => r.Result switch
    {
        "1/2-1/2" => 0,
        "1-0" => r.Color == RmGamePlayer.White ? 1 : -1,
        "0-1" => r.Color == RmGamePlayer.Black ? 1 : -1,
        _ => null,
    };
}
