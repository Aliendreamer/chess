namespace Chess.Backend.Akka.Ping;

internal static class PingTopics
{
    /// <summary>Reusing the game topic on purpose: the ping is a stand-in for a game aggregate.</summary>
    public const string Kafka = "game.events";
    public const string PubSub = "pings";
    public const string ShardTypeName = "pings";

    public static string Key(string pingId) => "ping:" + pingId;
}
