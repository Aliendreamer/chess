namespace Chess.Backend.WebApi.Admin;

/// <summary>A parked projection record: the response is a <c>CursorPage</c> of these.</summary>
internal sealed record DeadLetterItem(
    Guid Id,
    string GroupId,
    string AggregateId,
    long Seq,
    string KafkaKey,
    string Value,
    int Attempts,
    string LastError,
    DateTimeOffset FirstFailedAt,
    DateTimeOffset ParkedAt);
