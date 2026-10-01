using Chess.Backend.Games;

namespace Chess.Backend.WebApi.Games;

/// <summary>A row of <c>GET /api/games</c>: the response is a <c>CursorPage</c> of these.</summary>
internal sealed record GameListItem(
    Guid GameId,
    long WhiteId,
    string White,
    long BlackId,
    string Black,
    string TimeControl,
    string Status,
    string? Result,
    EndReason? Reason,
    int Ply,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
