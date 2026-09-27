using Chess.Backend.Events;
using Chess.Backend.Games;

namespace Chess.Backend.Akka.Games;

/// <summary>Every message the games region routes; the entity id is <see cref="GameId"/> in <c>N</c> form.</summary>
internal interface IGameCommand
{
    Guid GameId { get; }
}

/// <summary>A new game; <paramref name="Engine"/> names the side the engine plays in a game against it (engine-play D3).</summary>
internal sealed record CreateGame(Guid GameId, long WhiteId, long BlackId, TimeControl TimeControl, EnginePlayer? Engine = null)
    : IGameCommand;

/// <summary>A move; <paramref name="AtPly"/>, when given, must be the game's ply count, so a stale engine answer is refused (engine-play D6).</summary>
internal sealed record MakeMove(Guid GameId, long UserId, string Uci, int? AtPly = null) : IGameCommand;

internal sealed record Resign(Guid GameId, long UserId) : IGameCommand;

internal sealed record OfferDraw(Guid GameId, long UserId) : IGameCommand;

internal sealed record AcceptDraw(Guid GameId, long UserId) : IGameCommand;

internal sealed record DeclineDraw(Guid GameId, long UserId) : IGameCommand;

internal sealed record AbortGame(Guid GameId, long UserId) : IGameCommand;

internal sealed record GetGameView(Guid GameId) : IGameCommand;

/// <summary>
/// From the deadline sweeper (correspondence-games D3): end the game if its player to move is past the deadline.
/// The game is the judge; a check that is early, late or repeated changes nothing. No reply.
/// </summary>
internal sealed record CheckDeadline(Guid GameId) : IGameCommand;

/// <summary>
/// From the BFF through the hub (presence-and-abandonment D1–D2): <paramref name="UserId"/> has (or no longer has) a
/// socket on this game at BFF process <paramref name="Instance"/>. Re-sent every 30 s as a lease; no reply.
/// </summary>
internal sealed record ReportPresence(Guid GameId, long UserId, string Instance, bool Present) : IGameCommand;

/// <summary>The remaining player ends a game whose opponent has been away a minute: a win, or a draw (D5).</summary>
internal sealed record ClaimAbandonment(Guid GameId, long UserId, bool Win) : IGameCommand;

/// <summary>Written as its name (<c>"Playing"</c>) on the wire, over HTTP and the live relay alike.</summary>
[System.Text.Json.Serialization.JsonConverter(typeof(System.Text.Json.Serialization.JsonStringEnumConverter<GameStatus>))]
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
/// <see cref="AbsentId"/> is a player counted away; <see cref="ClaimableBy"/> is who may end the game by abandonment.
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
    long Seq,
    long? AbsentId = null,
    long? ClaimableBy = null,
    string? EngineSide = null,
    string? EngineLevel = null,
    DateTimeOffset? DeadlineAt = null);

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
    string? Reason,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastMoveAt,
    long[]? Absent = null,
    EnginePlayer? Engine = null);
