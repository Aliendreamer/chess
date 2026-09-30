using System.Diagnostics;
using System.Text;
using Confluent.Kafka;

namespace Chess.Backend.Akka;

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
        publish?.SetTag(TelemetryTags.MessagingSystem, TelemetryTags.MessagingKafka);
        publish?.SetTag(TelemetryTags.MessagingDestination, topic);
        publish?.SetTag(TelemetryTags.MessagingKey, key);
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

    /// <summary>
    /// The span around every attempt at one record for one consumer group; a new trace when the record has none. The
    /// slow-consume rule in otel-sampler.yml matches its name, <c>consume {group}</c>.
    /// </summary>
    public static Activity? StartConsume(string groupId, string? traceParent)
    {
        string name = $"consume {groupId}";
        Activity? activity = traceParent is not null && ActivityContext.TryParse(traceParent, null, out ActivityContext parent)
            ? Source.StartActivity(name, ActivityKind.Consumer, parent)
            : Source.StartActivity(name, ActivityKind.Consumer);
        activity?.SetTag(TelemetryTags.MessagingSystem, TelemetryTags.MessagingKafka);
        activity?.SetTag(TelemetryTags.MessagingGroup, groupId);
        return activity;
    }
}
