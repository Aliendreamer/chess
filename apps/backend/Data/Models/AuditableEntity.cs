namespace Chess.Backend.Data.Models;

internal abstract class AuditableEntity
{
    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>Monotonic per-row revision, bumped by <see cref="AuditInterceptor"/> on every update.</summary>
    public long Version { get; set; }
}
