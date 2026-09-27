namespace Chess.Backend.WebApi.Pings;

/// <summary>A row of <c>GET /api/pings</c>: the response is a <c>CursorPage</c> of these.</summary>
internal sealed record PingListItem(string PingId, long Count, string? LastText, DateTimeOffset? LastAt, long LastSeq, DateTimeOffset UpdatedAt);
