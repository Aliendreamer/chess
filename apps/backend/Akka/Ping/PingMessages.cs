using System.Text.RegularExpressions;
using Akka.Cluster.Sharding;
using Chess.Backend.Extensions;
using Chess.Backend.Messaging;

namespace Chess.Backend.Akka.Ping;

internal interface IPingCommand
{
    string PingId { get; }
}

internal sealed record Ping(string PingId, string Text, long UserId) : IPingCommand;

internal sealed record GetPingState(string PingId) : IPingCommand;

internal sealed record PingState(string PingId, long Count, string? LastText, DateTimeOffset? LastAt, long LastSeq);

internal sealed record PingRejected(string PingId, string Reason);

/// <summary>Journal snapshot payload — kept separate from the reply type so the reply can evolve freely.</summary>
internal sealed record PingSnapshot(long Count, string? LastText, DateTimeOffset? LastAt);

internal static class PingTopics
{
    /// <summary>Reusing the game topic on purpose: the ping is a stand-in for a game aggregate.</summary>
    public const string Kafka = Outbox.GameTopics.Kafka;
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

/// <summary>Entity id = ping id; shard id is a stable hash of the entity id over <see cref="AkkaOptions.ShardCount"/>.</summary>
internal sealed class PingMessageExtractor(int shardCount) : HashCodeMessageExtractor(shardCount)
{
    public override string? EntityId(object message) => ActorTracing.Unwrap(message) is IPingCommand c ? c.PingId : null;
}

/// <summary>The <c>ping</c> live kind: a subscriber's snapshot is the entity's current state, asked from its shard.</summary>
internal sealed class PingLiveSource(IRequiredActor<PingActor> region, IOptions<ApiOptions> api) : ILiveTopicSource
{
    public const string KindName = "ping";

    public string Kind => KindName;

    public bool IsValidId(string id)
    {
        try
        {
            PingIds.Validate(id);
            return true;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    public async Task<LiveFrame?> SnapshotAsync(string id, CancellationToken ct)
    {
        PingState state = await region.ActorRef.Ask<PingState>(ActorTracing.Wrap(new GetPingState(PingIds.Validate(id))), api.Value.AskTimeout, ct);
        return ToFrame(state);
    }

    public static LiveFrame ToFrame(PingState state)
    {
        ArgumentNullException.ThrowIfNull(state);
        return new LiveFrame(LiveTopics.Format(KindName, state.PingId), state.LastSeq, state);
    }
}
