using System.Diagnostics;
using System.Text;
using Chess.Backend.Events;
using Confluent.Kafka;

namespace Chess.Backend.Akka;

/// <summary>
/// A command carrying its sender's trace context across a mailbox (observability D3). Made only by
/// <see cref="ActorTracing.Wrap"/>, and only while something traces: with tracing off every message travels bare.
/// </summary>
internal sealed record Traced(object Message, string TraceParent, string? TraceState = null);

/// <summary>
/// The one <see cref="ActivitySource"/> the actors emit on, and how a trace crosses an actor: senders
/// <see cref="Wrap"/> the command, the actor's <c>AroundReceive</c> goes through <see cref="Receive"/>, and every event
/// it persists is <see cref="Stamp{T}"/>ed with the span it was made in. Spans exist only while something listens —
/// with tracing off <see cref="ActivitySource.StartActivity(string, ActivityKind)"/> returns null and the call sites
/// cost a null check, which is why the actors can instrument unconditionally.
/// </summary>
internal static class ActorTracing
{
    public const string SourceName = "chess.actors";

    public static readonly ActivitySource Source = new(SourceName);

    /// <summary>The message with the current trace context, or the message itself when nothing is being traced.</summary>
    public static object Wrap(object message)
    {
        ArgumentNullException.ThrowIfNull(message);
        return message is not Traced && Activity.Current is { IdFormat: ActivityIdFormat.W3C, Id: { } id } current
            ? new Traced(message, id, current.TraceStateString)
            : message;
    }

    /// <summary>The command inside an envelope, or the message itself.</summary>
    public static object Unwrap(object message) => message is Traced traced ? traced.Message : message;

    /// <summary>The event with the current span's traceparent, when there is one (observability D4).</summary>
    public static T Stamp<T>(T evt)
        where T : notnull =>
        evt is ITracedEvent traced && Activity.Current is { IdFormat: ActivityIdFormat.W3C, Id: { } id }
            ? (T)traced.WithTrace(id)
            : evt;

    /// <summary>The trace a live frame should carry: its event's, else the span being handled.</summary>
    public static string? TraceOf(object? cause) =>
        (cause as ITracedEvent)?.Trace ?? (Activity.Current is { IdFormat: ActivityIdFormat.W3C, Id: { } id } ? id : null);

    public static List<T> StampAll<T>(IEnumerable<T> events)
        where T : notnull => [.. events.Select(Stamp)];

    /// <summary>
    /// Handles one message inside a span <c>{actor} {message}</c>: a child of the sender's trace when the message came
    /// <see cref="Traced"/>, a new trace when <paramref name="startsTrace"/> says the message begins one (a timer), and
    /// no span otherwise. The thread's ambient activity is cleared for the handler and restored after it, so work from
    /// whoever scheduled the mailbox never leaks into this message's spans or events.
    /// </summary>
    public static bool Receive(
        string actor,
        object message,
        Func<object, bool> handle,
        Func<object, bool>? startsTrace = null,
        KeyValuePair<string, object?>? entity = null)
    {
        ArgumentNullException.ThrowIfNull(handle);
        object inner = Unwrap(message);
        Activity? previous = Activity.Current;
        Activity.Current = null;
        Activity? activity = Start(actor, message, inner, startsTrace);
        if (activity is not null && entity is { } tag)
        {
            activity.SetTag(tag.Key, tag.Value);
        }

        try
        {
            return handle(inner);
        }
        catch (Exception e)
        {
            activity?.SetStatus(ActivityStatusCode.Error, e.Message);
            activity?.AddException(e);
            throw;
        }
        finally
        {
            activity?.Dispose();
            Activity.Current = previous;
        }
    }

    private static Activity? Start(string actor, object message, object inner, Func<object, bool>? startsTrace)
    {
        string name = $"{actor} {inner.GetType().Name}";
        Activity? activity;
        if (message is Traced traced && ActivityContext.TryParse(traced.TraceParent, traced.TraceState, out ActivityContext parent))
        {
            activity = Source.StartActivity(name, ActivityKind.Consumer, parent);
        }
        else if (startsTrace?.Invoke(inner) == true)
        {
            activity = Source.StartActivity(name, ActivityKind.Internal);
        }
        else
        {
            return null;
        }

        activity?.SetTag("actor.type", actor);
        activity?.SetTag("actor.message", inner.GetType().Name);
        return activity;
    }

    /// <summary>A span continuing <paramref name="traceParent"/>, or none when there is no trace to continue.</summary>
    public static Activity? StartChild(string name, string? traceParent, ActivityKind kind) =>
        traceParent is not null && ActivityContext.TryParse(traceParent, null, out ActivityContext parent)
            ? Source.StartActivity(name, kind, parent)
            : null;

    /// <summary>The span around one <c>Ping</c> command: persist → pubsub → reply.</summary>
    public static Activity? StartPingHandle(string pingId, long seq)
    {
        Activity? activity = Source.StartActivity("ping.handle");
        activity?.SetTag("ping.id", pingId);
        activity?.SetTag("ping.seq", seq);
        return activity;
    }

    /// <summary>The span around one acked publisher batch: saving its highest ordering through the lease.</summary>
    public static Activity? StartOutboxBatch(string streamId, int count, long lastOrdering)
    {
        Activity? activity = Source.StartActivity("outbox.batch");
        activity?.SetTag("outbox.stream", streamId);
        activity?.SetTag("outbox.count", count);
        activity?.SetTag("outbox.last_ordering", lastOrdering);
        return activity;
    }
}

/// <summary>
/// A trace across Kafka (observability D5): records carry the W3C <c>traceparent</c> (and <c>tracestate</c>) header.
/// The publisher produces each journal record in a <c>publish {topic}</c> span continuing its event's trace; direct
/// producers write the current span; consumers run each record in a <c>consume {group}</c> span under the header.
/// </summary>
internal static class PipelineTracing
{
    public const string SourceName = "chess.pipeline";

    public const string TraceParentHeader = "traceparent";

    public static readonly ActivitySource Source = new(SourceName);

    /// <summary>
    /// The header to write for a journal record: the context of its <c>publish</c> span, a child of the event's trace.
    /// With nothing listening the event's own trace is written, so consumers still continue it.
    /// </summary>
    public static string? Publish(string topic, string key, string? eventTrace)
    {
        if (eventTrace is null || !ActivityContext.TryParse(eventTrace, null, out ActivityContext parent))
        {
            return null;
        }

        using Activity? publish = Source.StartActivity($"publish {topic}", ActivityKind.Producer, parent);
        publish?.SetTag("messaging.system", "kafka");
        publish?.SetTag("messaging.destination.name", topic);
        publish?.SetTag("messaging.kafka.message.key", key);
        return publish?.Id ?? eventTrace;
    }

    /// <summary>Headers carrying <paramref name="traceParent"/>, or null when there is none.</summary>
    public static Headers? Headers(string? traceParent) =>
        traceParent is null ? null : new Headers { { TraceParentHeader, Encoding.UTF8.GetBytes(traceParent) } };

    /// <summary>Headers carrying the current span, for producers that are not the journal publisher.</summary>
    public static Headers? CurrentHeaders() =>
        Headers(Activity.Current is { IdFormat: ActivityIdFormat.W3C, Id: { } id } ? id : null);

    public static string? TraceParent(Headers? headers) =>
        headers is not null && headers.TryGetLastBytes(TraceParentHeader, out byte[] value) ? Encoding.UTF8.GetString(value) : null;

    /// <summary>The span around every attempt at one record for one consumer group; a new trace when the record has none.</summary>
    public static Activity? StartConsume(string groupId, string? traceParent)
    {
        string name = $"consume {groupId}";
        Activity? activity = traceParent is not null && ActivityContext.TryParse(traceParent, null, out ActivityContext parent)
            ? Source.StartActivity(name, ActivityKind.Consumer, parent)
            : Source.StartActivity(name, ActivityKind.Consumer);
        activity?.SetTag("messaging.system", "kafka");
        activity?.SetTag("messaging.consumer.group.name", groupId);
        return activity;
    }
}
