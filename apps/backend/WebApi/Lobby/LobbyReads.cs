using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Extensions;
using Chess.Backend.Games;

namespace Chess.Backend.WebApi.Lobby;

/// <summary>Section <c>Lobby</c> (live-home): how many games Club TV shows and how long one answer is shared.</summary>
internal sealed class LobbyOptions : ISettings
{
    public const string SectionName = "Lobby";

    /// <summary>The most Club TV games the lobby lists.</summary>
    public int TvGames { get; set; } = 6;

    /// <summary>How long every caller shares one answer (one replica query and one singleton ask per period).</summary>
    public int CacheSeconds { get; set; } = 2;

    public void Validate()
    {
        if (TvGames is <= 0 or > 50)
        {
            throw new InvalidOperationException("Lobby:TvGames must be between 1 and 50.");
        }

        if (CacheSeconds <= 0)
        {
            throw new InvalidOperationException("Lobby:CacheSeconds must be positive.");
        }
    }
}

/// <summary>The lobby's queries and its answer (live-home). Pure over <see cref="IQueryable{T}"/>, so tested without a database.</summary>
internal static class LobbyReads
{
    private static readonly string Correspondence = TimeControl.Correspondence7.ToString();

    public static IQueryable<RmGame> InPlay(IQueryable<RmGame> games) => games.Where(g => g.Status == RmGame.Playing);

    /// <summary>Club TV: games in play by latest activity (there are no ratings to rank by); a 7-day game is not TV.</summary>
    public static IQueryable<RmGame> Tv(IQueryable<RmGame> games, int limit) =>
        InPlay(games)
            .Where(g => g.TimeControl != Correspondence)
            .OrderByDescending(g => g.UpdatedAt)
            .ThenByDescending(g => g.GameId)
            .Take(limit);

    public static LobbyResponse Compose(int gamesInPlay, IReadOnlyList<RmGame> tv, QueueCounts? queues) => new(
        gamesInPlay,
        queues?.Queues,
        [.. tv.Select(g => new TvGame(g.GameId, g.WhiteId, g.WhiteName, g.BlackId, g.BlackName, g.TimeControl, g.LastFen, g.LastUci, g.Ply, g.UpdatedAt))]);
}
