namespace Chess.Backend.WebApi.Games;

/// <summary>One move of <c>GET /api/games/{id}/moves</c> (the response is the list, in ply order).</summary>
internal sealed record MoveItem(int Ply, string Uci, string San, string FenAfter, long WhiteMs, long BlackMs, DateTimeOffset At);
