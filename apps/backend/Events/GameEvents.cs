using System.Text.Json.Serialization;

namespace Chess.Backend.Events;

// Game domain events (design D3). Persisted by GameActor, tailed into Kafka `game.events` by the journal outbox, so
// every field is primitive and named for the wire: these ARE the public contract of a game's history.

internal sealed record GameCreated(
    [property: JsonPropertyName("whiteId")] long WhiteId,
    [property: JsonPropertyName("blackId")] long BlackId,
    [property: JsonPropertyName("timeControl")] string TimeControl,
    [property: JsonPropertyName("initialMs")] long InitialMs,
    [property: JsonPropertyName("incrementMs")] long IncrementMs,
    [property: JsonPropertyName("at")] DateTimeOffset At);

/// <summary>One accepted move: the canonical record (UCI + SAN), the position after it, and both clocks (D13, D22).</summary>
internal sealed record MoveMade(
    [property: JsonPropertyName("ply")] int Ply,
    [property: JsonPropertyName("uci")] string Uci,
    [property: JsonPropertyName("san")] string San,
    [property: JsonPropertyName("fenAfter")] string FenAfter,
    [property: JsonPropertyName("whiteMs")] long WhiteMs,
    [property: JsonPropertyName("blackMs")] long BlackMs,
    [property: JsonPropertyName("at")] DateTimeOffset At);

internal sealed record DrawOffered(
    [property: JsonPropertyName("by")] long By,
    [property: JsonPropertyName("at")] DateTimeOffset At);

internal sealed record DrawDeclined(
    [property: JsonPropertyName("by")] long By,
    [property: JsonPropertyName("at")] DateTimeOffset At);

/// <summary>The one ending event (D18). <see cref="Result"/> is PGN (<c>1-0</c>, <c>0-1</c>, <c>1/2-1/2</c>, <c>*</c>).</summary>
internal sealed record GameEnded(
    [property: JsonPropertyName("result")] string Result,
    [property: JsonPropertyName("reason")] string Reason,
    [property: JsonPropertyName("whiteMs")] long WhiteMs,
    [property: JsonPropertyName("blackMs")] long BlackMs,
    [property: JsonPropertyName("at")] DateTimeOffset At);
