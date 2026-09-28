using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Text;
using Confluent.Kafka;

namespace Chess.Engine;

/// <summary>
/// Section <c>Observability</c>, the same switch as the backend's (observability D2): the worker exports traces,
/// metrics and logs over OTLP only when enabled. Off by default; the local stack turns it on.
/// </summary>
internal sealed class ObservabilityOptions
{
    public const string SectionName = "Observability";

    public bool Enabled { get; set; }

    public string OtlpEndpoint { get; set; } = "http://otel-collector:4317";

    /// <summary>Parent-based: a job follows its asker's decision; a job nobody traced keeps this share.</summary>
    public double SampleRatio { get; set; } = 1.0;

    public string Environment { get; set; } = "local";

    public int MetricExportSeconds { get; set; } = 15;

    public void Validate()
    {
        EngineOptions.Require(SampleRatio is >= 0 and <= 1, "Observability:SampleRatio must be between 0 and 1.");
        EngineOptions.Require(MetricExportSeconds > 0, "Observability:MetricExportSeconds must be positive.");
        EngineOptions.Require(
            !Enabled || Uri.TryCreate(OtlpEndpoint, UriKind.Absolute, out _),
            "Observability:OtlpEndpoint must be an absolute URI when Observability:Enabled.");
    }
}

/// <summary>
/// The worker's spans and metrics (observability D5, D8): each job is an <c>engine {kind}</c> span continuing the
/// request's <c>traceparent</c> header, and its result carries that span on to whoever applies it. Meter
/// <c>chess.engine</c>: jobs by kind and outcome, think time, engine restarts and dropped requests.
/// </summary>
internal static class EngineTelemetry
{
    public const string SourceName = "chess.engine";
    public const string MeterName = "chess.engine";
    public const string TraceParentHeader = "traceparent";

    public static readonly ActivitySource Source = new(SourceName);

    private static readonly Meter Meter = new(MeterName);
    private static readonly Counter<long> Jobs = Meter.CreateCounter<long>("chess.engine.jobs", description: "Jobs by kind and outcome");
    private static readonly Histogram<double> ThinkDuration = Meter.CreateHistogram<double>("chess.engine.think.duration", "s", "Time to answer one job");
    private static readonly Counter<long> Restarts = Meter.CreateCounter<long>("chess.engine.restarts", description: "Engine processes replaced after a failure");
    private static readonly Counter<long> Dropped = Meter.CreateCounter<long>("chess.engine.dropped", description: "Requests dropped without a search");

    /// <summary>One request: handled in a span of the asker's trace, timed, counted, and its result given the span's context.</summary>
    public static async Task<Message<string, string>?> ProcessAsync(
        string kind,
        Message<string, string> request,
        Func<string, CancellationToken, Task<Message<string, string>?>> handle,
        CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(handle);
        Activity.Current = null; // a job never runs under whatever the loop ran before
        string? asker = TraceParent(request.Headers);
        using Activity? job = asker is not null && ActivityContext.TryParse(asker, null, out ActivityContext parent)
            ? Source.StartActivity($"engine {kind}", ActivityKind.Consumer, parent)
            : Source.StartActivity($"engine {kind}", ActivityKind.Consumer);
        job?.SetTag("engine.job", kind);
        job?.SetTag("messaging.kafka.message.key", request.Key);
        long started = Stopwatch.GetTimestamp();
        Message<string, string>? result = await handle(request.Value, ct).ConfigureAwait(false);
        string outcome = result is null ? "dropped" : "answered";
        job?.SetTag("engine.outcome", outcome);
        Jobs.Add(1, new TagList { { "kind", kind }, { "outcome", outcome } });
        if (result is not null)
        {
            ThinkDuration.Record(Stopwatch.GetElapsedTime(started).TotalSeconds, new TagList { { "kind", kind } });
            if (job?.Id is { } id)
            {
                result.Headers = new Headers { { TraceParentHeader, Encoding.UTF8.GetBytes(id) } };
            }
        }

        return result;
    }

    public static void Restarted(string job) => Restarts.Add(1, new TagList { { "kind", KindOf(job) } });

    public static void DroppedRequest(string kind, string reason) => Dropped.Add(1, new TagList { { "kind", kind }, { "reason", reason } });

    public static string? TraceParent(Headers? headers) =>
        headers is not null && headers.TryGetLastBytes(TraceParentHeader, out byte[] value) ? Encoding.UTF8.GetString(value) : null;

    private static string KindOf(string job) => job.StartsWith("analysis", StringComparison.Ordinal) ? "analysis" : "move";
}
