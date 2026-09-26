namespace Chess.Backend.WebApi.Me;

/// <summary><see cref="Username"/> is the display name (D23): <c>preferred_username</c>, else <c>Player {id}</c>.</summary>
internal sealed record MeResponse(long Id, string Subject, string? Email, IReadOnlyList<string> Roles, string Username);
