using Chess.Backend.Games;

namespace Chess.Backend.Akka.Games;

/// <summary>Every message the games region routes; the entity id is <see cref="GameId"/> in <c>N</c> form.</summary>
internal interface IGameCommand
{
    Guid GameId { get; }
}

internal sealed record CreateGame(Guid GameId, long WhiteId, long BlackId, TimeControl TimeControl) : IGameCommand;

internal sealed record MakeMove(Guid GameId, long UserId, string Uci) : IGameCommand;

internal sealed record Resign(Guid GameId, long UserId) : IGameCommand;

internal sealed record OfferDraw(Guid GameId, long UserId) : IGameCommand;

internal sealed record AcceptDraw(Guid GameId, long UserId) : IGameCommand;

internal sealed record DeclineDraw(Guid GameId, long UserId) : IGameCommand;

internal sealed record AbortGame(Guid GameId, long UserId) : IGameCommand;

internal sealed record GetGameView(Guid GameId) : IGameCommand;

internal enum GameStatus
{
    /// <summary>Both players known, no move yet.</summary>
    Created,
    Playing,
    Ended,
}

/// <summary>How a refused command maps to HTTP: 403, 422, 409, 404.</summary>
internal enum RejectionCode
{
    Forbidden,
    Illegal,
    Conflict,
    NotFound,
}

internal sealed record GameRejected(Guid GameId, RejectionCode Code, string Reason);

/// <summary>
/// What a command answers and what the live relay carries (the <c>game</c> kind's payload). Clocks are as of
/// <see cref="ClockAt"/>, so a client can count the side to move down locally and correct itself on the next frame.
/// </summary>
internal sealed record GameView(
    Guid GameId,
    long WhiteId,
    long BlackId,
    string TimeControl,
    GameStatus Status,
    string Fen,
    int Ply,
    string SideToMove,
    string? LastUci,
    string? LastSan,
    long WhiteMs,
    long BlackMs,
    DateTimeOffset ClockAt,
    long? DrawOfferedBy,
    string? Result,
    string? Reason,
    long Seq);

/// <summary>
/// Journal snapshot: the UCI move list, not a FEN, because threefold repetition needs the history (design D2).
/// Separate from <see cref="GameView"/> so the reply can evolve without touching stored snapshots.
/// </summary>
internal sealed record GameSnapshot(
    long WhiteId,
    long BlackId,
    string TimeControl,
    string[] Moves,
    string? LastSan,
    long WhiteMs,
    long BlackMs,
    GameStatus Status,
    long? DrawOfferedBy,
    long? DrawBlocked,
    string? Result,
    string? Reason);
