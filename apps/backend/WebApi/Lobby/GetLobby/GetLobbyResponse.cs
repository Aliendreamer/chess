using Chess.Backend.Akka.Matchmaking;

namespace Chess.Backend.WebApi.Lobby;

/// <summary>
/// The lobby (live-home): games in play, the people waiting per preset (<c>null</c> when matchmaking did not answer in
/// time), and the Club TV games.
/// </summary>
internal sealed record LobbyResponse(int GamesInPlay, IReadOnlyList<QueueCount>? Queues, IReadOnlyList<TvGame> Tv);

/// <summary>A Club TV game: enough to draw a mini board and name both players (names snapshotted per game, D23).</summary>
internal sealed record TvGame(
    Guid GameId,
    long WhiteId,
    string White,
    long BlackId,
    string Black,
    string TimeControl,
    string Fen,
    string? LastUci,
    int Ply,
    DateTimeOffset UpdatedAt);
