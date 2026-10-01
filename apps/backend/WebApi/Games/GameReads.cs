using Chess.Backend.Akka.Games;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Games;
using Npgsql;

namespace Chess.Backend.WebApi.Games;

/// <summary>Read-model rows → API shapes (game-history). Pure, so the endpoints stay thin and this is what's tested.</summary>
internal static class GameReads
{
    public static bool IsListStatus(string? status) => status is RmGame.Playing or RmGame.Ended;

    public static GameListItem ToListItem(RmGame g) => new(
        g.GameId, g.WhiteId, g.WhiteName, g.BlackId, g.BlackName, g.TimeControl, g.Status, g.Result, EndReasons.Parse(g.Reason), g.Ply, g.CreatedAt, g.UpdatedAt);

    public static MyGameItem ToMyGame(RmGamePlayer me, RmGame g, TimeSpan moveDeadline) => new(
        g.GameId, me.Color, me.OpponentId, me.OpponentName, g.TimeControl, g.Status, g.Result, EndReasons.Parse(g.Reason), me.CreatedAt,
        YourTurn: g.Status == RmGame.Playing && ColorToMove(g.Ply) == me.Color,
        DeadlineAt: g.Status == RmGame.Playing && g.TimeControl == TimeControl.Correspondence7.ToString() ? g.UpdatedAt + moveDeadline : null);

    /// <summary>White moves on even plies (correspondence-games D5): the side to move needs no column of its own.</summary>
    public static string ColorToMove(int ply) => ply % 2 == 0 ? RmGamePlayer.White : RmGamePlayer.Black;

    public static GameSummary ToSummary(RmGame g) => new(
        g.GameId, g.WhiteId, g.WhiteName, g.BlackId, g.BlackName, g.TimeControl, g.Status, g.Result, EndReasons.Parse(g.Reason), g.Ply, g.LastFen,
        g.CreatedAt, g.EndedAt, g.Pgn is not null);

    public static MoveItem ToMove(RmMove m) => new(m.Ply, m.Uci, m.San, m.FenAfter, m.WhiteMs, m.BlackMs, m.At);

    /// <summary>An ended game's live view straight from its row, the same shape the actor answers with (D5).</summary>
    public static GameView ToView(RmGame g) => new(
        g.GameId, g.WhiteId, g.BlackId, g.TimeControl, GameStatus.Ended, g.LastFen, g.Ply, g.Ply % 2 == 0 ? Side.White : Side.Black,
        g.LastUci, g.LastSan, g.WhiteMs, g.BlackMs, g.EndedAt ?? g.UpdatedAt, null, g.Result, EndReasons.Parse(g.Reason), g.LastSeq);
}
