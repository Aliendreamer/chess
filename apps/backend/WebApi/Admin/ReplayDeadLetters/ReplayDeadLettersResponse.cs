namespace Chess.Backend.WebApi.Admin;

/// <summary>What a replay did: <c>Replayed</c> (quarantine lifted) or <c>Failed</c> (the failing record and later ones stay parked).</summary>
internal sealed record ReplayDeadLettersResponse(string GroupId, string AggregateId, string Status, int Applied, string? Error);
