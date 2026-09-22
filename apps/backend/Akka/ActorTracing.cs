using System.Diagnostics;

namespace Chess.Backend.Akka;

/// <summary>
/// The one <see cref="ActivitySource"/> the actors emit on. Spans exist only while something listens —
/// with tracing off <see cref="ActivitySource.StartActivity(string, ActivityKind)"/> returns null and the
/// call sites cost a null check, which is why the actors can instrument unconditionally.
/// </summary>
internal static class ActorTracing
{
    public const string SourceName = "chess.actors";

    public static readonly ActivitySource Source = new(SourceName);

    /// <summary>The span around one <c>Ping</c> command: persist → publish → pubsub → reply.</summary>
    public static Activity? StartPingHandle(string pingId, long seq)
    {
        Activity? activity = Source.StartActivity("ping.handle");
        activity?.SetTag("ping.id", pingId);
        activity?.SetTag("ping.seq", seq);
        return activity;
    }
}
