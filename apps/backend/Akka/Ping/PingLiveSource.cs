using Chess.Backend.Live;

namespace Chess.Backend.Akka.Ping;

/// <summary>The <c>ping</c> live kind: a subscriber's snapshot is the entity's current state, asked from its shard.</summary>
internal sealed class PingLiveSource(IRequiredActor<PingActor> region) : ILiveTopicSource
{
    public const string KindName = "ping";

    private static readonly TimeSpan AskTimeout = TimeSpan.FromSeconds(5);

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
        PingState state = await region.ActorRef.Ask<PingState>(new GetPingState(PingIds.Validate(id)), AskTimeout, ct);
        return ToFrame(state);
    }

    public static LiveFrame ToFrame(PingState state)
    {
        ArgumentNullException.ThrowIfNull(state);
        return new LiveFrame(LiveTopics.Format(KindName, state.PingId), state.LastSeq, state);
    }
}
