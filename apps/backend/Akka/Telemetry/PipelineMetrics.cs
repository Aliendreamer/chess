using System.Collections.Immutable;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using Akka.Cluster.Sharding;
using Akka.Event;
using Chess.Backend.Projections;

namespace Chess.Backend.Akka;

/// <summary>
/// Meter <c>chess.pipeline</c> (observability D8): records the journal publisher produced per topic, and how far it is
/// behind the journal; each projection group's records by outcome and their handling time, and its quarantined
/// aggregates. Lag and quarantine are read by the health checks already; the gauges show their latest reading.
/// </summary>
internal static class PipelineMetrics
{
    public const string MeterName = "chess.pipeline";

    private static readonly Meter Meter = new(MeterName);
    private static readonly Counter<long> Published = Meter.CreateCounter<long>("chess.outbox.published", description: "Records the journal publisher produced");
    private static readonly Counter<long> Records = Meter.CreateCounter<long>("chess.projection.records", description: "Kafka records per consumer group, by outcome");
    private static readonly Histogram<double> RecordDuration = Meter.CreateHistogram<double>("chess.projection.duration", "s", "Time to handle one record, retries included");

    private static ImmutableDictionary<string, long> LagByTopic = ImmutableDictionary<string, long>.Empty;
    private static ImmutableDictionary<string, int> QuarantinedByGroup = ImmutableDictionary<string, int>.Empty;

    static PipelineMetrics()
    {
        Meter.CreateObservableGauge("chess.outbox.lag", () =>
            Volatile.Read(ref LagByTopic).Select(l => new Measurement<long>(l.Value, new KeyValuePair<string, object?>(TelemetryTags.Topic, l.Key))), description: "Journal events not yet on Kafka, per topic");
        Meter.CreateObservableGauge("chess.projection.quarantined", () =>
            Volatile.Read(ref QuarantinedByGroup).Select(q => new Measurement<int>(q.Value, new KeyValuePair<string, object?>(TelemetryTags.Group, q.Key))), description: "Aggregates parked per consumer group");
    }

    public static void Produced(string topic, int count) => Published.Add(count, new TagList { { TelemetryTags.Topic, topic } });

    public static void Projected(string group, ProjectionOutcome outcome, TimeSpan elapsed)
    {
        Records.Add(1, new TagList { { TelemetryTags.Group, group }, { TelemetryTags.Outcome, outcome.Label() } });
        RecordDuration.Record(elapsed.TotalSeconds, new TagList { { TelemetryTags.Group, group } });
    }

    public static void Lag(string topic, long lag) => ImmutableInterlocked.AddOrUpdate(ref LagByTopic, topic, lag, (_, _) => lag);

    /// <summary>The latest quarantine counts; a group with none left reads 0 rather than keeping its last value.</summary>
    public static void Quarantined(IReadOnlyDictionary<string, int> counts)
    {
        ArgumentNullException.ThrowIfNull(counts);
        ImmutableDictionary<string, int> next = Volatile.Read(ref QuarantinedByGroup).ToImmutableDictionary(q => q.Key, _ => 0);
        Volatile.Write(ref QuarantinedByGroup, next.SetItems(counts));
    }
}
