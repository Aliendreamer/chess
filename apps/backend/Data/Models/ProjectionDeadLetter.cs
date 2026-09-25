namespace Chess.Backend.Data.Models;

/// <summary>
/// A Kafka record a projection could not apply, parked so its partition keeps flowing. Any row for a
/// <c>(GroupId, AggregateId)</c> quarantines that aggregate for that consumer: later events are parked too,
/// until an operator replays them in <see cref="Seq"/> order and the last row is deleted.
/// </summary>
internal sealed class ProjectionDeadLetter
{
    /// <summary>Guid v7 in a native <c>uuid</c> column (ROADMAP D11): time-ordered, 16 bytes, the keyset tiebreak.</summary>
    public Guid Id { get; set; }

    public required string GroupId { get; set; }

    /// <summary>From the envelope; the Kafka key when the value has no readable envelope.</summary>
    public required string AggregateId { get; set; }

    /// <summary>Journal sequence from the envelope; 0 when the value has no readable envelope.</summary>
    public long Seq { get; set; }

    public required string KafkaKey { get; set; }

    /// <summary>The raw record value, exactly as consumed.</summary>
    public required string Value { get; set; }

    /// <summary>Failed attempts before parking; 0 when parked behind an existing quarantine without a call.</summary>
    public int Attempts { get; set; }

    /// <summary>Exception type and message only, truncated; the stack trace is in the log.</summary>
    public required string LastError { get; set; }

    public DateTimeOffset FirstFailedAt { get; set; }

    public DateTimeOffset ParkedAt { get; set; }
}
