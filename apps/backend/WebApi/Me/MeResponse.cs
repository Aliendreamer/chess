namespace Chess.Backend.WebApi.Me;

internal sealed record MeResponse(long Id, string Subject, string? Email, IReadOnlyList<string> Roles);
