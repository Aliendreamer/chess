using Chess.Backend.Akka.Matchmaking;

namespace Chess.Backend.WebApi.Lobby;

/// <summary>
/// The lobby (live-home): games in play and the people waiting per preset (<c>null</c> when matchmaking did not answer in
/// time).
/// </summary>
internal sealed record LobbyResponse(int GamesInPlay, IReadOnlyList<QueueCount>? Queues);
