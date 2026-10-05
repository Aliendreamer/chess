namespace Chess.Backend.WebApi.Admin;

/// <summary>One import run: the month, running/finished/failed, and what happened to its games.</summary>
internal sealed record BroadcastImportRunView(
    Guid Id,
    string Month,
    string State,
    int Read,
    int Kept,
    int Imported,
    int Duplicate,
    int Refused,
    string? Error,
    DateTimeOffset StartedAt,
    DateTimeOffset? FinishedAt);
