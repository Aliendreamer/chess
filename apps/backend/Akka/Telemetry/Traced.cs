using System.Text;
using Chess.Backend.Events;
using Confluent.Kafka;

namespace Chess.Backend.Akka;

/// <summary>
/// A command carrying its sender's trace context across a mailbox (observability D3). Made only by
/// <see cref="ActorTracing.Wrap"/>, and only while something traces: with tracing off every message travels bare.
/// </summary>
internal sealed record Traced(object Message, string TraceParent, string? TraceState = null);
