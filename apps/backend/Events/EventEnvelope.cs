using System.Collections.Frozen;
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

/// <summary>
/// The envelope <c>type</c> of every game event on <see cref="Akka.Outbox.GameTopics.Kafka"/>. Written by the mappers and
/// matched by every consumer; the values are on the wire and in replays, so they never change.
/// </summary>
internal static class GameEventTypes
{
    /// <summary>What every game event type starts with.</summary>
    public const string Prefix = "game.";

    public const string Created = "game.created";
    public const string MoveMade = "game.move-made";
    public const string DrawOffered = "game.draw-offered";
    public const string DrawDeclined = "game.draw-declined";
    public const string Ended = "game.ended";
    public const string PlayerLeft = "game.player-left";
    public const string PlayerReturned = "game.player-returned";
    public const string AbandonmentOffered = "game.abandonment-offered";

    public static readonly FrozenSet<string> All = FrozenSet.ToFrozenSet(
        [Created, MoveMade, DrawOffered, DrawDeclined, Ended, PlayerLeft, PlayerReturned, AbandonmentOffered], StringComparer.Ordinal);
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
