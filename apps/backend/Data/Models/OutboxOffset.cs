namespace Chess.Backend.Data.Models;

/// <summary>
/// How far the journal publisher has got, per stream (one per Kafka topic tag). <see cref="LastOrdering"/> is
/// the Akka journal's global <c>ordering</c> of the last event Kafka acknowledged; publishing resumes after it.
/// Written only by the fenced publisher, on its lock connection.
/// </summary>
internal sealed class OutboxOffset
{
    public required string StreamId { get; set; }

    public long LastOrdering { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
