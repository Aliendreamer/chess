using System.Collections.Concurrent;
using System.Diagnostics;
using Chess.Backend.Akka;
using Chess.Backend.Akka.Outbox;

namespace Chess.Backend.Tests.Outbox;

/// <summary>
/// A trace crosses Kafka as the W3C <c>traceparent</c> header (observability D5): the publisher produces each record in
/// a span continuing its event's trace and writes that span's context; a record without a trace has no header.
/// </summary>
public sealed class KafkaTraceHeadersTests : IDisposable
{
    private const string TraceId = "0af7651916cd43dd8448eb211c80319c";
    private const string Trace = "00-" + TraceId + "-b7ad6b7169203331-01";

    private static readonly ActivitySource Test = new("chess.tests.kafka");

    private readonly ConcurrentQueue<Activity> _stopped = new();
    private readonly ActivityListener _listener;

    public KafkaTraceHeadersTests()
    {
        _listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name is PipelineTracing.SourceName or "chess.tests.kafka",
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = _stopped.Enqueue,
        };
        ActivitySource.AddActivityListener(_listener);
        Activity.Current = null;
    }

    public void Dispose() => _listener.Dispose();

    [Fact]
    public void A_record_without_a_trace_is_produced_without_a_header()
    {
        Confluent.Kafka.Message<string, string> message = new OutboxRecord("game.events", "game:g1", "{}").ToMessage();

        Assert.Null(PipelineTracing.TraceParent(message.Headers));
        Assert.Equal(("game:g1", "{}"), (message.Key, message.Value));
    }

    [Fact]
    public void A_traced_record_is_published_in_a_child_span_whose_context_becomes_the_header()
    {
        Confluent.Kafka.Message<string, string> message = new OutboxRecord("game.events", "game:g2", "{}", Trace).ToMessage();

        Activity publish = Assert.Single(_stopped, a => a.OperationName == "publish game.events" && a.TraceId.ToHexString() == TraceId);
        Assert.Equal(publish.Id, PipelineTracing.TraceParent(message.Headers));
        Assert.Equal("b7ad6b7169203331", publish.ParentSpanId.ToHexString());
        Assert.Equal(ActivityKind.Producer, publish.Kind);
    }

    [Fact]
    public void A_direct_producer_writes_the_current_span_or_nothing()
    {
        Assert.Null(PipelineTracing.CurrentHeaders());

        using Activity request = Test.StartActivity("POST /api/analysis")!;

        Assert.Equal(request.Id, PipelineTracing.TraceParent(PipelineTracing.CurrentHeaders()));
    }
}
