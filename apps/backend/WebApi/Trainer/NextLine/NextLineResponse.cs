using Chess.Backend.Trainer;

namespace Chess.Backend.WebApi.Trainer;

/// <summary>The line to drill next, or none for now with when the next is due.</summary>
internal sealed record NextLineResponse(LineProgress? Line, DateTimeOffset? NextDueAt);
