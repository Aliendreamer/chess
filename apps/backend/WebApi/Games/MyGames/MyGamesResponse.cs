namespace Chess.Backend.WebApi.Games;

/// <summary>A row of <c>GET /api/me/games</c>, seen from the signed-in player's side: the response is a <c>CursorPage</c> of these.</summary>
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
