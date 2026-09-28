using Akka.Cluster.Sharding;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Events;
using Chess.Backend.Extensions;
using Chess.Backend.Games;
using Chess.Backend.Messaging;
using Chess.Backend.WebApi.Games;

namespace Chess.Backend.Akka.Games;

/// <summary>Entity id = game id in <c>N</c> form; shard id is a stable hash of it over <see cref="AkkaOptions.ShardCount"/>.</summary>
internal sealed class GameMessageExtractor(int shardCount) : HashCodeMessageExtractor(shardCount)
{
    public override string? EntityId(object message) => ActorTracing.Unwrap(message) is IGameCommand c ? c.GameId.ToString("N") : null;
}

/// <summary>Reads an ended game's view from the read side, or null when the replica doesn't have its ending (yet).</summary>
internal interface IEndedGameReader
{
    Task<GameView?> ReadEndedAsync(Guid gameId, CancellationToken ct);
}

/// <summary>
/// The <c>game</c> live kind: a subscriber's snapshot is the game's current view (D5). A finished game is answered from
/// <c>rm_games</c> on the replica so it isn't woken (game-history); a live one, or one whose ending the replica hasn't
/// caught up with, from its actor — which also wakes a dormant game and re-arms its clocks.
/// </summary>
internal sealed partial class GameLiveSource(IRequiredActor<GameActor> region, IEndedGameReader endedGames, IOptions<ApiOptions> api) : ILiveTopicSource
{
    public const string KindName = "game";

    public string Kind => KindName;

    public bool IsValidId(string id) => IdPattern().IsMatch(id);

    public async Task<LiveFrame?> SnapshotAsync(string id, CancellationToken ct)
    {
        Guid gameId = Guid.ParseExact(id, "N");
        GameView? ended = null;
        try
        {
            ended = await endedGames.ReadEndedAsync(gameId, ct);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            // The read side is an optimisation here; the actor can always answer.
        }

        if (ended is not null)
        {
            return ToFrame(ended);
        }

        object reply = await region.ActorRef.Ask(ActorTracing.Wrap(new GetGameView(gameId)), api.Value.AskTimeout, ct);
        return reply is GameView view ? ToFrame(view) : null;
    }

    public static LiveFrame ToFrame(GameView view)
    {
        ArgumentNullException.ThrowIfNull(view);
        return new LiveFrame(LiveTopics.Format(KindName, view.GameId.ToString("N")), view.Seq, view);
    }

    [System.Text.RegularExpressions.GeneratedRegex("^[0-9a-f]{32}$")]
    private static partial System.Text.RegularExpressions.Regex IdPattern();
}

/// <summary>How games come into being (design D6). Matchmaking and invites (change 3) are its callers; no endpoint yet.</summary>
internal interface IGameStarter
{
    /// <summary>Starts a game; <paramref name="engine"/> seats the engine in a game against it (engine-play D3).</summary>
    Task<GameView> StartAsync(long whiteId, long blackId, TimeControl timeControl, CancellationToken ct, EnginePlayer? engine = null);
}

internal sealed class GameStarter(IRequiredActor<GameActor> region, IOptions<ApiOptions> api) : IGameStarter
{
    public async Task<GameView> StartAsync(long whiteId, long blackId, TimeControl timeControl, CancellationToken ct, EnginePlayer? engine = null)
    {
        Guid id = Guid.CreateVersion7();
        object reply = await region.ActorRef.Ask(ActorTracing.Wrap(new CreateGame(id, whiteId, blackId, timeControl, engine)), api.Value.AskTimeout, ct);
        return reply as GameView
            ?? throw new InvalidOperationException($"Game {id:N} was not created: {(reply as GameRejected)?.Reason ?? reply.GetType().Name}");
    }
}

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
