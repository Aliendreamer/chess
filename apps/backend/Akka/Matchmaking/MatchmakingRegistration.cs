using Akka.Cluster.Hosting;
using Akka.Cluster.Tools.PublishSubscribe;
using Chess.Backend.Akka.Games;

namespace Chess.Backend.Akka.Matchmaking;

internal static class MatchmakingRegistration
{
    /// <summary>The matchmaking singleton on the backend role, with a proxy so every node's endpoints reach it.</summary>
    public static AkkaConfigurationBuilder WithMatchmaking(this AkkaConfigurationBuilder akka)
    {
        ArgumentNullException.ThrowIfNull(akka);
        return akka.WithSingleton<MatchmakingActor>(
            MatchmakingActor.SingletonName,
            (system, _, resolver) => Props.Create(() => new MatchmakingActor(
                resolver.GetService<IGameStarter>(),
                DistributedPubSub.Get(system).Mediator,
                resolver.GetService<TimeProvider>(),
                Random.Shared)),
            new ClusterSingletonOptions { Role = AkkaOptions.BackendRole },
            createProxyToo: true);
    }
}
