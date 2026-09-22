namespace Chess.Backend.Data.ReadModels;

/// <summary>Projection of the ping journal; written by PingProjection on the primary, read from the replica.</summary>
internal sealed class RmPing
{
    public required string PingId { get; set; }

    public long Count { get; set; }

    public string? LastText { get; set; }

    public DateTimeOffset? LastAt { get; set; }

    /// <summary>Journal sequence of the last applied event — the idempotency watermark.</summary>
    public long LastSeq { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
