using Chess.Backend.Projections;
using Npgsql;

namespace Chess.Backend.Tests.Projections;

public sealed class ConflictDetectorTests
{
    private static PostgresException Postgres(string sqlState) => new("boom", "ERROR", "ERROR", sqlState);

    [Fact]
    public void A_stale_update_is_a_conflict() =>
        Assert.True(ConflictDetector.IsConflict(new DbUpdateConcurrencyException("0 rows")));

    [Fact]
    public void A_duplicate_first_insert_is_a_conflict() =>
        Assert.True(ConflictDetector.IsConflict(new DbUpdateException("dup", Postgres(PostgresErrorCodes.UniqueViolation))));

    [Theory]
    [InlineData(PostgresErrorCodes.ForeignKeyViolation)]
    [InlineData(PostgresErrorCodes.NotNullViolation)]
    public void Other_constraint_failures_are_not_conflicts(string sqlState) =>
        Assert.False(ConflictDetector.IsConflict(new DbUpdateException("bad", Postgres(sqlState))));

    [Fact]
    public void A_bare_update_failure_or_any_other_exception_is_not_a_conflict()
    {
        Assert.False(ConflictDetector.IsConflict(new DbUpdateException("bad")));
        Assert.False(ConflictDetector.IsConflict(new InvalidOperationException("bug")));
    }
}
