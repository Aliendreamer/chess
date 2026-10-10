using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Extensions;

namespace Chess.Backend.WebApi.Lobby;

/// <summary>Section <c>Lobby</c> (live-home): how long one answer is shared.</summary>
internal sealed class LobbyOptions : ISettings
{
    public const string SectionName = "Lobby";

    /// <summary>How long every caller shares one answer (one replica query and one singleton ask per period).</summary>
    public int CacheSeconds { get; set; } = 2;

    public void Validate()
    {
        if (CacheSeconds <= 0)
        {
            throw new InvalidOperationException("Lobby:CacheSeconds must be positive.");
        }
    }
}

/// <summary>The lobby's queries and its answer (live-home). Pure over <see cref="IQueryable{T}"/>, so tested without a database.</summary>
internal static class LobbyReads
{
    public static IQueryable<RmGame> InPlay(IQueryable<RmGame> games) => games.Where(g => g.Status == RmGame.Playing);

    public static LobbyResponse Compose(int gamesInPlay, QueueCounts? queues) => new(gamesInPlay, queues?.Queues);
}
