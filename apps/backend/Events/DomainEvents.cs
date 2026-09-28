using System.Text.Json.Serialization;

namespace Chess.Backend.Events;

// Game domain events (design D3). Persisted by GameActor, tailed into Kafka `game.events` by the journal outbox, so
// every field is primitive and named for the wire: these ARE the public contract of a game's history.
//
// Every event's last member, `Trace`, is the W3C traceparent of the command that made it (observability D4): journal
// metadata, never domain data. The journal (Newtonsoft JSON) keeps it so the publisher can continue the trace; the
// wire (System.Text.Json) ignores it, so Kafka payloads are unchanged. Rows written before it existed read as null.

/// <summary>An event that can carry the trace it was made in; the actors stamp it through <c>ActorTracing.Stamp</c>.</summary>
internal interface ITracedEvent
{
    string? Trace { get; }

    ITracedEvent WithTrace(string? trace);
}

internal sealed record GameCreated(
    [property: JsonPropertyName("whiteId")] long WhiteId,
    [property: JsonPropertyName("blackId")] long BlackId,
    [property: JsonPropertyName("timeControl")] string TimeControl,
    [property: JsonPropertyName("initialMs")] long InitialMs,
    [property: JsonPropertyName("incrementMs")] long IncrementMs,
    [property: JsonPropertyName("at")] DateTimeOffset At,
    [property: JsonPropertyName("engine")] EnginePlayer? Engine = null,
    [property: JsonIgnore] string? Trace = null) : ITracedEvent
{
    public ITracedEvent WithTrace(string? trace) => this with { Trace = trace };
}

/// <summary>
/// Which side the engine plays, at which level (engine-play D3); null in a game between people. Optional, so journal
/// rows and Kafka payloads written before engine games still read.
/// </summary>
internal sealed record EnginePlayer(
    [property: JsonPropertyName("side")] string Side,
    [property: JsonPropertyName("level")] string Level);

/// <summary>One accepted move: the canonical record (UCI + SAN), the position after it, and both clocks (D13, D22).</summary>
internal sealed record MoveMade(
    [property: JsonPropertyName("ply")] int Ply,
    [property: JsonPropertyName("uci")] string Uci,
    [property: JsonPropertyName("san")] string San,
    [property: JsonPropertyName("fenAfter")] string FenAfter,
    [property: JsonPropertyName("whiteMs")] long WhiteMs,
    [property: JsonPropertyName("blackMs")] long BlackMs,
    [property: JsonPropertyName("at")] DateTimeOffset At,
    [property: JsonIgnore] string? Trace = null) : ITracedEvent
{
    public ITracedEvent WithTrace(string? trace) => this with { Trace = trace };
}

internal sealed record DrawOffered(
    [property: JsonPropertyName("by")] long By,
    [property: JsonPropertyName("at")] DateTimeOffset At,
    [property: JsonIgnore] string? Trace = null) : ITracedEvent
{
    public ITracedEvent WithTrace(string? trace) => this with { Trace = trace };
}

internal sealed record DrawDeclined(
    [property: JsonPropertyName("by")] long By,
    [property: JsonPropertyName("at")] DateTimeOffset At,
    [property: JsonIgnore] string? Trace = null) : ITracedEvent
{
    public ITracedEvent WithTrace(string? trace) => this with { Trace = trace };
}

/// <summary>The one ending event (D18). <see cref="Result"/> is PGN (<c>1-0</c>, <c>0-1</c>, <c>1/2-1/2</c>, <c>*</c>).</summary>
internal sealed record GameEnded(
    [property: JsonPropertyName("result")] string Result,
    [property: JsonPropertyName("reason")] string Reason,
    [property: JsonPropertyName("whiteMs")] long WhiteMs,
    [property: JsonPropertyName("blackMs")] long BlackMs,
    [property: JsonPropertyName("at")] DateTimeOffset At,
    [property: JsonIgnore] string? Trace = null) : ITracedEvent
{
    public ITracedEvent WithTrace(string? trace) => this with { Trace = trace };
}

// Presence transitions (presence-and-abandonment D3). Tagged for Kafka like every game event: consumers track a
// game's seq and stall on a gap, so none of its events may be left out, even ones no read model shows.

/// <summary>Every BFF instance lost <see cref="UserId"/> (last socket closed, or the lease ran out).</summary>
internal sealed record PlayerLeft(
    [property: JsonPropertyName("userId")] long UserId,
    [property: JsonPropertyName("at")] DateTimeOffset At,
    [property: JsonIgnore] string? Trace = null) : ITracedEvent
{
    public ITracedEvent WithTrace(string? trace) => this with { Trace = trace };
}

internal sealed record PlayerReturned(
    [property: JsonPropertyName("userId")] long UserId,
    [property: JsonPropertyName("at")] DateTimeOffset At,
    [property: JsonIgnore] string? Trace = null) : ITracedEvent
{
    public ITracedEvent WithTrace(string? trace) => this with { Trace = trace };
}

/// <summary>The claim opened for <see cref="ClaimantId"/>: persisted so the frame that says so has a newer seq.</summary>
internal sealed record AbandonmentOffered(
    [property: JsonPropertyName("claimantId")] long ClaimantId,
    [property: JsonPropertyName("at")] DateTimeOffset At,
    [property: JsonIgnore] string? Trace = null) : ITracedEvent
{
    public ITracedEvent WithTrace(string? trace) => this with { Trace = trace };
}

// Invite domain events (game-matchmaking). Journal-only for now — not tagged for Kafka, no read model needs them —
// but primitive and wire-named so they could be tagged later without a migration.

internal sealed record InviteCreated(
    [property: JsonPropertyName("creatorId")] long CreatorId,
    [property: JsonPropertyName("timeControl")] string TimeControl,
    [property: JsonPropertyName("color")] string Color,
    [property: JsonPropertyName("at")] DateTimeOffset At,
    [property: JsonIgnore] string? Trace = null) : ITracedEvent
{
    public ITracedEvent WithTrace(string? trace) => this with { Trace = trace };
}

internal sealed record InviteAccepted(
    [property: JsonPropertyName("byId")] long ById,
    [property: JsonPropertyName("gameId")] Guid GameId,
    [property: JsonPropertyName("at")] DateTimeOffset At,
    [property: JsonIgnore] string? Trace = null) : ITracedEvent
{
    public ITracedEvent WithTrace(string? trace) => this with { Trace = trace };
}

internal sealed record InviteCancelled(
    [property: JsonPropertyName("at")] DateTimeOffset At,
    [property: JsonIgnore] string? Trace = null) : ITracedEvent
{
    public ITracedEvent WithTrace(string? trace) => this with { Trace = trace };
}

internal sealed record Pinged(
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("userId")] long UserId,
    [property: JsonPropertyName("at")] DateTimeOffset At,
    [property: JsonIgnore] string? Trace = null) : ITracedEvent
{
    public ITracedEvent WithTrace(string? trace) => this with { Trace = trace };
}
