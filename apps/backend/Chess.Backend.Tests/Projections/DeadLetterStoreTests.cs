using Chess.Backend.Projections;

namespace Chess.Backend.Tests.Projections;

public sealed class DeadLetterStoreTests
{
    private static readonly DateTimeOffset T0 = DateTimeOffset.Parse("2026-09-24T10:00:00Z", System.Globalization.CultureInfo.InvariantCulture);

    private static DeadLetterStore Store(ProjectDbContext db, TimeProvider? clock = null) =>
        new(db, NullLogger<DeadLetterStore>.Instance, clock ?? new FakeClock(T0));

    private static ParkRequest Park(string group, string agg, long seq, string error = "boom") =>
        new(group, agg, seq, $"key-{agg}", $"{{\"seq\":{seq}}}", 5, error, T0.AddSeconds(-7));

    [Fact]
    public async Task Parks_every_field_and_stamps_parked_at()
    {
        using ProjectDbContext db = TestDb.Create();

        await Store(db).ParkAsync(Park("g", "a", 7), CancellationToken.None);

        ProjectionDeadLetter row = await db.ProjectionDeadLetters.SingleAsync();
        Assert.Equal(("g", "a", 7L, "key-a", "{\"seq\":7}", 5, "boom"), (row.GroupId, row.AggregateId, row.Seq, row.KafkaKey, row.Value, row.Attempts, row.LastError));
        Assert.Equal(T0.AddSeconds(-7), row.FirstFailedAt);
        Assert.Equal(T0, row.ParkedAt);
        Assert.False(string.IsNullOrEmpty(row.Id));
    }

    [Fact]
    public async Task Truncates_the_error_to_2000_chars()
    {
        using ProjectDbContext db = TestDb.Create();

        await Store(db).ParkAsync(Park("g", "a", 1, new string('x', 5000)), CancellationToken.None);

        Assert.Equal(DeadLetterStore.MaxErrorLength, (await db.ProjectionDeadLetters.SingleAsync()).LastError.Length);
    }

    [Fact]
    public async Task Quarantine_is_per_group_and_aggregate()
    {
        using ProjectDbContext db = TestDb.Create();
        DeadLetterStore store = Store(db);
        await store.ParkAsync(Park("g1", "a", 1), CancellationToken.None);

        Assert.True(await store.IsQuarantinedAsync("g1", "a", CancellationToken.None));
        Assert.False(await store.IsQuarantinedAsync("g2", "a", CancellationToken.None));
        Assert.False(await store.IsQuarantinedAsync("g1", "b", CancellationToken.None));
    }

    [Fact]
    public async Task Parks_behind_an_existing_quarantine_only()
    {
        using ProjectDbContext db = TestDb.Create();
        DeadLetterStore store = Store(db);

        Assert.False(await store.ParkIfQuarantinedAsync(Park("g", "a", 1), CancellationToken.None));
        Assert.Equal(0, await db.ProjectionDeadLetters.CountAsync());

        await store.ParkAsync(Park("g", "a", 1), CancellationToken.None);
        Assert.True(await store.ParkIfQuarantinedAsync(Park("g", "a", 2), CancellationToken.None));
        Assert.Equal(2, await db.ProjectionDeadLetters.CountAsync());
    }

    [Fact]
    public async Task Next_returns_the_lowest_seq_and_delete_lifts_the_quarantine()
    {
        using ProjectDbContext db = TestDb.Create();
        DeadLetterStore store = Store(db);
        await store.ParkAsync(Park("g", "a", 8), CancellationToken.None);
        await store.ParkAsync(Park("g", "a", 7), CancellationToken.None);
        await store.ParkAsync(Park("g", "b", 1), CancellationToken.None);

        ProjectionDeadLetter? first = await store.NextAsync("g", "a", CancellationToken.None);
        Assert.Equal(7, first!.Seq);
        await store.DeleteAsync(first, CancellationToken.None);
        ProjectionDeadLetter? second = await store.NextAsync("g", "a", CancellationToken.None);
        Assert.Equal(8, second!.Seq);
        await store.DeleteAsync(second, CancellationToken.None);

        Assert.Null(await store.NextAsync("g", "a", CancellationToken.None));
        Assert.False(await store.IsQuarantinedAsync("g", "a", CancellationToken.None));
        Assert.True(await store.IsQuarantinedAsync("g", "b", CancellationToken.None));
    }

    [Fact]
    public async Task Counts_distinct_quarantined_aggregates_per_group()
    {
        using ProjectDbContext db = TestDb.Create();
        DeadLetterStore store = Store(db);
        await store.ParkAsync(Park("g1", "a", 1), CancellationToken.None);
        await store.ParkAsync(Park("g1", "a", 2), CancellationToken.None);
        await store.ParkAsync(Park("g1", "b", 1), CancellationToken.None);
        await store.ParkAsync(Park("g2", "a", 1), CancellationToken.None);

        IReadOnlyDictionary<string, int> counts = await store.CountsAsync(CancellationToken.None);

        Assert.Equal(2, counts["g1"]);
        Assert.Equal(1, counts["g2"]);
    }

    [Fact]
    public async Task The_aggregate_lock_runs_the_body_and_returns_its_result()
    {
        using ProjectDbContext db = TestDb.Create();

        int result = await Store(db).WithAggregateLockAsync("g", "a", _ => Task.FromResult(42), CancellationToken.None);

        Assert.Equal(42, result);
    }
}
