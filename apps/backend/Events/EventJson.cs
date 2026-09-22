using System.Text.Json;

namespace Chess.Backend.Events;

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
