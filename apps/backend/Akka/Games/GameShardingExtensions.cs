using Akka.Cluster.Hosting;
using Akka.Cluster.Sharding;
using Akka.Cluster.Tools.PublishSubscribe;
using Chess.Backend.Games;
using Chess.Backend.Live;

namespace Chess.Backend.Akka.Games;

internal static class GameShardingExtensions
{
    public const string ShardTypeName = "games";

    /// <summary>
    /// Idle passivation is OFF for this region (Akka's default is 120 s): a live game's clock timers only run while the
    /// entity is alive, and a long think sends no message through the shard. Each game passivates itself instead,
    /// per its <see cref="PassivationPolicy"/> (design D8).
    /// </summary>
    public static ShardOptions ShardOptions() => new()
    {
        Role = AkkaOptions.BackendRole,
        PassivateIdleEntityAfter = TimeSpan.Zero,
        RememberEntities = false,
    };

    /// <summary>Registers the `games` region; `IRequiredActor&lt;GameActor&gt;` then resolves to it.</summary>
    public static AkkaConfigurationBuilder WithGameSharding(this AkkaConfigurationBuilder akka, AkkaOptions options)
    {
        ArgumentNullException.ThrowIfNull(akka);
        ArgumentNullException.ThrowIfNull(options);
        return akka.WithShardRegion<GameActor>(
            ShardTypeName,
            (system, _, resolver) => id => Props.Create(() => new GameActor(
                Guid.ParseExact(id, "N"),
                DistributedPubSub.Get(system).Mediator,
                resolver.GetService<TimeProvider>())),
            new GameMessageExtractor(options.ShardCount),
            ShardOptions());
    }
}

/// <summary>Entity id = game id in <c>N</c> form; shard id is a stable hash of it over <see cref="AkkaOptions.ShardCount"/>.</summary>
internal sealed class GameMessageExtractor(int shardCount) : HashCodeMessageExtractor(shardCount)
{
    public override string? EntityId(object message) => message is IGameCommand c ? c.GameId.ToString("N") : null;
}

/// <summary>The <c>game</c> live kind: a subscriber's snapshot is the game's current view (D5), which also wakes it.</summary>
internal sealed partial class GameLiveSource(IRequiredActor<GameActor> region) : ILiveTopicSource
{
    public const string KindName = "game";

    private static readonly TimeSpan AskTimeout = TimeSpan.FromSeconds(5);

    public string Kind => KindName;

    public bool IsValidId(string id) => IdPattern().IsMatch(id);

    public async Task<LiveFrame?> SnapshotAsync(string id, CancellationToken ct)
    {
        object reply = await region.ActorRef.Ask(new GetGameView(Guid.ParseExact(id, "N")), AskTimeout, ct);
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
    Task<GameView> StartAsync(long whiteId, long blackId, TimeControl timeControl, CancellationToken ct);
}

internal sealed class GameStarter(IRequiredActor<GameActor> region) : IGameStarter
{
    private static readonly TimeSpan AskTimeout = TimeSpan.FromSeconds(5);

    public async Task<GameView> StartAsync(long whiteId, long blackId, TimeControl timeControl, CancellationToken ct)
    {
        Guid id = Guid.CreateVersion7();
        object reply = await region.ActorRef.Ask(new CreateGame(id, whiteId, blackId, timeControl), AskTimeout, ct);
        return reply as GameView
            ?? throw new InvalidOperationException($"Game {id:N} was not created: {(reply as GameRejected)?.Reason ?? reply.GetType().Name}");
    }
}
