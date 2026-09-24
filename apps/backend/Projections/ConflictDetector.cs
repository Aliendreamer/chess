using Npgsql;

namespace Chess.Backend.Projections;

/// <summary>
/// Recognises a lost race on a projection watermark (design D2): a stale <c>UPDATE … WHERE "LastSeq" = @original</c>
/// that hit zero rows, or two consumers inserting the first row for the same aggregate. Either way the event was
/// already applied by the winner, so the caller re-runs it on a fresh context and the idempotency guard skips it.
/// </summary>
internal static class ConflictDetector
{
    public static bool IsConflict(Exception exception) => exception switch
    {
        DbUpdateConcurrencyException => true,
        DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } } => true,
        _ => false,
    };
}
