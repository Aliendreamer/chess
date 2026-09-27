using System.Text.Json;
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

internal static class EventJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static string Serialize<T>(EventEnvelope<T> envelope)
    {
        ArgumentNullException.ThrowIfNull(envelope);
        return JsonSerializer.Serialize(envelope, Options);
    }

    public static bool TryDeserialize<T>(string? json, [NotNullWhen(true)] out EventEnvelope<T>? envelope)
    {
        envelope = null;
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }

        try
        {
            envelope = JsonSerializer.Deserialize<EventEnvelope<T>>(json, Options);
        }
        catch (JsonException)
        {
            return false;
        }

        if (envelope is not { Type.Length: > 0, AggregateId.Length: > 0, Seq: > 0, Payload: not null })
        {
            envelope = null;
            return false;
        }

        return true;
    }
}
