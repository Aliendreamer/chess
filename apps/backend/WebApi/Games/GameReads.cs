using Chess.Backend.Akka.Games;
using Chess.Backend.Data.ReadModels;

namespace Chess.Backend.WebApi.Games;

internal sealed record GameListItem(
    Guid GameId,
    long WhiteId,
    string White,
    long BlackId,
    string Black,
    string TimeControl,
    string Status,
    string? Result,
    string? Reason,
    int Ply,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

internal sealed record MyGameItem(
    Guid GameId,
    string Color,
    long OpponentId,
    string Opponent,
    string TimeControl,
    string Status,
    string? Result,
    string? Reason,
    DateTimeOffset CreatedAt);

internal sealed record GameSummary(
    Guid GameId,
    long WhiteId,
    string White,
    long BlackId,
    string Black,
    string TimeControl,
    string Status,
    string? Result,
    string? Reason,
    int Ply,
    string LastFen,
    DateTimeOffset CreatedAt,
    DateTimeOffset? EndedAt,
    bool HasPgn);

internal sealed record MoveItem(int Ply, string Uci, string San, string FenAfter, long WhiteMs, long BlackMs, DateTimeOffset At);

/// <summary>Read-model rows → API shapes (game-history). Pure, so the endpoints stay thin and this is what's tested.</summary>
internal static class GameReads
{
    public static bool IsListStatus(string? status) => status is RmGame.Playing or RmGame.Ended;

    public static GameListItem ToListItem(RmGame g) => new(
        g.GameId, g.WhiteId, g.WhiteName, g.BlackId, g.BlackName, g.TimeControl, g.Status, g.Result, g.Reason, g.Ply, g.CreatedAt, g.UpdatedAt);

    public static MyGameItem ToMyGame(RmGamePlayer me, RmGame g) => new(
        g.GameId, me.Color, me.OpponentId, me.OpponentName, g.TimeControl, g.Status, g.Result, g.Reason, me.CreatedAt);

    public static GameSummary ToSummary(RmGame g) => new(
        g.GameId, g.WhiteId, g.WhiteName, g.BlackId, g.BlackName, g.TimeControl, g.Status, g.Result, g.Reason, g.Ply, g.LastFen,
        g.CreatedAt, g.EndedAt, g.Pgn is not null);

    public static MoveItem ToMove(RmMove m) => new(m.Ply, m.Uci, m.San, m.FenAfter, m.WhiteMs, m.BlackMs, m.At);

    /// <summary>An ended game's live view straight from its row, the same shape the actor answers with (D5).</summary>
    public static GameView ToView(RmGame g) => new(
        g.GameId, g.WhiteId, g.BlackId, g.TimeControl, GameStatus.Ended, g.LastFen, g.Ply, g.Ply % 2 == 0 ? "White" : "Black",
        g.LastUci, g.LastSan, g.WhiteMs, g.BlackMs, g.EndedAt ?? g.UpdatedAt, null, g.Result, g.Reason, g.LastSeq);
}
