using Chess.Backend.Data.ReadModels;
using Chess.Backend.WebApi.Games;

namespace Chess.Backend.Akka.Games;

/// <summary><see cref="IEndedGameReader"/> over <c>rm_games</c> on the replica (a fresh scope per read: the source is a singleton).</summary>
[ExcludeFromCodeCoverage(Justification = "Thin EF query on the replica; proved by GameHistoryTests in the integration suite.")]
internal sealed class ReplicaEndedGameReader(IServiceScopeFactory scopes) : IEndedGameReader
{
    public async Task<GameView?> ReadEndedAsync(Guid gameId, CancellationToken ct)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        ReadDbContext read = scope.ServiceProvider.GetRequiredService<ReadDbContext>();
        RmGame? game = await read.RmGames.SingleOrDefaultAsync(g => g.GameId == gameId && g.Status == RmGame.Ended, ct);
        return game is null ? null : GameReads.ToView(game);
    }
}
