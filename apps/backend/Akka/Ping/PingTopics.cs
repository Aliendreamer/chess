using System.Text.RegularExpressions;

namespace Chess.Backend.Akka.Ping;

internal static class PingTopics
{
    /// <summary>Reusing the game topic on purpose: the ping is a stand-in for a game aggregate.</summary>
    public const string Kafka = "game.events";
    public const string ShardTypeName = "pings";

    public static string Key(string pingId) => "ping:" + pingId;
}

/// <summary>Single source of truth for the ping id shape; endpoints and Task 7's hub both validate through it.</summary>
internal static partial class PingIds
{
    public const string Pattern = "^[a-z0-9-]{1,64}$";

    /// <summary>Returns <paramref name="pingId"/> unchanged, or throws <see cref="ArgumentException"/>.</summary>
    public static string Validate(string? pingId)
    {
        if (string.IsNullOrEmpty(pingId) || !ValidPattern().IsMatch(pingId))
        {
            throw new ArgumentException($"Ping id must match {Pattern}.", nameof(pingId));
        }

        return pingId;
    }

    [GeneratedRegex(Pattern)]
    private static partial Regex ValidPattern();
}
