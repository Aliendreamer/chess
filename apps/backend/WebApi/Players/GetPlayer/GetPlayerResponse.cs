using Chess.Backend.Games;

namespace Chess.Backend.WebApi.Players;

/// <summary>
/// A public profile (player-profiles): the current name, when they joined, whether it is the computer, and the record
/// in total and per time control. Never email, full name or preferences.
/// </summary>
internal sealed record PlayerProfile(
    long Id,
    string Name,
    DateTimeOffset MemberSince,
    bool IsComputer,
    int Wins,
    int Draws,
    int Losses,
    IReadOnlyList<TimeControlRecord> ByTimeControl);
