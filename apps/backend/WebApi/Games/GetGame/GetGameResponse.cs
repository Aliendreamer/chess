using Chess.Backend.Games;

namespace Chess.Backend.WebApi.Games;

/// <summary>A game's summary from the read side (names snapshotted per game, D23).</summary>
internal sealed record GameSummary(
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
    string LastFen,
    DateTimeOffset CreatedAt,
    DateTimeOffset? EndedAt,
    bool HasPgn);
