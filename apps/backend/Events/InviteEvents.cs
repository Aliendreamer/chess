using System.Text.Json.Serialization;

namespace Chess.Backend.Events;

// Invite domain events (game-matchmaking). Journal-only for now — not tagged for Kafka, no read model needs them —
// but primitive and wire-named so they could be tagged later without a migration.

internal sealed record InviteCreated(
    [property: JsonPropertyName("creatorId")] long CreatorId,
    [property: JsonPropertyName("timeControl")] string TimeControl,
    [property: JsonPropertyName("color")] string Color,
    [property: JsonPropertyName("at")] DateTimeOffset At);

internal sealed record InviteAccepted(
    [property: JsonPropertyName("byId")] long ById,
    [property: JsonPropertyName("gameId")] Guid GameId,
    [property: JsonPropertyName("at")] DateTimeOffset At);

internal sealed record InviteCancelled(
    [property: JsonPropertyName("at")] DateTimeOffset At);
