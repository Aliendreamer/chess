using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Text;
using Confluent.Kafka;

namespace Chess.Engine.Tests;

/// <summary>
/// The worker continues the asker's trace (observability D5): a job runs in an <c>engine {kind}</c> span under the
/// request's <c>traceparent</c> header, its result carries that span on, and every job is counted by kind and outcome.
/// </summary>
public sealed class TelemetryTests : IDisposable
{
    private readonly ConcurrentQueue<Activity> _stopped = new();
    private readonly ConcurrentQueue<(string Instrument, Dictionary<string, object?> Tags)> _measured = new();
    private readonly ActivityListener _spans;
    private readonly MeterListener _meters = new();

    public TelemetryTests()
    {
        _spans = new ActivityListener
        {
            ShouldListenTo = s => s.Name == EngineTelemetry.SourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = _stopped.Enqueue,
        };
        ActivitySource.AddActivityListener(_spans);
        _meters.InstrumentPublished = (i, l) =>
        {
            if (i.Meter.Name == EngineTelemetry.MeterName)
            {
                l.EnableMeasurementEvents(i);
            }
        };
        _meters.SetMeasurementEventCallback<long>((i, _, tags, _) => _measured.Enqueue((i.Name, tags.ToArray().ToDictionary(t => t.Key, t => t.Value))));
        _meters.SetMeasurementEventCallback<double>((i, _, tags, _) => _measured.Enqueue((i.Name, tags.ToArray().ToDictionary(t => t.Key, t => t.Value))));
        _meters.Start();
        Activity.Current = null;
    }

    public void Dispose()
    {
        _spans.Dispose();
        _meters.Dispose();
    }

    private static Message<string, string> Request(string? traceParent) => new()
    {
        Key = "g1",
        Value = "{}",
        Headers = traceParent is null ? null : new Headers { { "traceparent", Encoding.UTF8.GetBytes(traceParent) } },
    };

    private static string? Header(Message<string, string> message) =>
        message.Headers is not null && message.Headers.TryGetLastBytes("traceparent", out byte[] value) ? Encoding.UTF8.GetString(value) : null;

    private static Task<Message<string, string>?> Answer(string json, CancellationToken ct) =>
        Task.FromResult<Message<string, string>?>(new Message<string, string> { Key = "g1", Value = "answer" });

    [Fact]
    public async Task A_job_continues_the_askers_trace_and_its_result_carries_it_on()
    {
        ActivityTraceId traceId = ActivityTraceId.CreateRandom();
        string asker = $"00-{traceId.ToHexString()}-b7ad6b7169203331-01";

        Message<string, string>? result = await EngineTelemetry.ProcessAsync(JobKind.Move, Request(asker), Answer, CancellationToken.None);

        Activity job = Assert.Single(_stopped, a => a.TraceId == traceId);
        Assert.Equal("engine move", job.OperationName);
        Assert.Equal("b7ad6b7169203331", job.ParentSpanId.ToHexString());
        Assert.Equal(job.Id, Header(result!));
        Assert.Contains(_measured, m => m.Instrument == "chess.engine.jobs" && Equals(m.Tags["kind"], "move") && Equals(m.Tags["outcome"], "answered"));
        Assert.Contains(_measured, m => m.Instrument == "chess.engine.think.duration" && Equals(m.Tags["kind"], "move"));
    }

    [Fact]
    public async Task A_job_nobody_traced_starts_a_trace_of_its_own()
    {
        Message<string, string>? result = await EngineTelemetry.ProcessAsync(JobKind.Analysis, Request(null), Answer, CancellationToken.None);

        Activity job = Assert.Single(_stopped, a => a.Id == Header(result!));
        Assert.Equal("engine analysis", job.OperationName);
        Assert.Equal(default, job.ParentSpanId);
    }

    [Fact]
    public async Task A_dropped_job_is_counted_and_answers_nothing()
    {
        Message<string, string>? result = await EngineTelemetry.ProcessAsync(
            JobKind.Analysis, Request(null), (_, _) => Task.FromResult<Message<string, string>?>(null), CancellationToken.None);

        Assert.Null(result);
        Assert.Contains(_measured, m => m.Instrument == "chess.engine.jobs" && Equals(m.Tags["kind"], "analysis") && Equals(m.Tags["outcome"], "dropped"));
    }

    [Theory]
    [InlineData(1.5, "http://otel-collector:4317", "Observability:SampleRatio")]
    [InlineData(1.0, "collector", "Observability:OtlpEndpoint")]
    public void Nonsense_in_the_observability_settings_is_refused(double ratio, string endpoint, string setting)
    {
        new ObservabilityOptions().Validate();
        InvalidOperationException e = Assert.Throws<InvalidOperationException>(() =>
            new ObservabilityOptions { Enabled = true, SampleRatio = ratio, OtlpEndpoint = endpoint }.Validate());
        Assert.Contains(setting, e.Message, StringComparison.Ordinal);
    }
}
