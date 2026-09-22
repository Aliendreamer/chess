using System.Text.Json.Serialization;

namespace Chess.Backend.Events;

internal sealed record Pinged(
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("userId")] long UserId,
    [property: JsonPropertyName("at")] DateTimeOffset At);
