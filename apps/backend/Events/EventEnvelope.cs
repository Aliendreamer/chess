using System.Text.Json.Serialization;

namespace Chess.Backend.Events;

/// <summary>What travels on Kafka: a versioned, typed envelope keyed by aggregate and journal sequence.</summary>
internal sealed record EventEnvelope<T>(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("v")] int V,
    [property: JsonPropertyName("aggregateId")] string AggregateId,
    [property: JsonPropertyName("seq")] long Seq,
    [property: JsonPropertyName("at")] DateTimeOffset At,
    [property: JsonPropertyName("payload")] T Payload);

internal static class EventTypes
{
    public const string Pinged = "ping.pinged";
}
