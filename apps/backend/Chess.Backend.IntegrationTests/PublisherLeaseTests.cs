using Chess.Backend.Akka.Outbox;
using Chess.Backend.Data;
using Chess.Backend.IntegrationTests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// The fence that makes N backend containers safe (design D5): only one lease at a time, the lease dies with
/// its session, and the offset can only move forward. Also proves the AddOutboxOffsets seed on both a fresh
/// database and one whose journal already holds events.
/// </summary>
public sealed class PublisherLeaseTests(PostgresFixture pg) : IClassFixture<PostgresFixture>, IAsyncLifetime
{
    private const string Stream = "game.events";
    private string _db = string.Empty;

    public async Task InitializeAsync()
    {
        // A database per test: the seed depends on what the journal holds when the migration runs.
        _db = await CreateDatabaseAsync();
        await MigrateAsync(_db);
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Only_one_lease_at_a_time_and_the_next_one_gets_it_after_release()
    {
        PostgresPublisherLeaseProvider provider = new(_db);
        IPublisherLease? first = await provider.TryAcquireAsync(CancellationToken.None);
        Assert.NotNull(first);

        Assert.Null(await provider.TryAcquireAsync(CancellationToken.None));

        await first.DisposeAsync();
        await using IPublisherLease? second = await provider.TryAcquireAsync(CancellationToken.None);
        Assert.NotNull(second);
    }

    [Fact]
    public async Task Fresh_database_is_seeded_at_zero_and_an_unknown_stream_throws()
    {
        await using IPublisherLease lease = (await new PostgresPublisherLeaseProvider(_db).TryAcquireAsync(CancellationToken.None))!;

        Assert.Equal(0, await lease.LoadOffsetAsync(Stream, CancellationToken.None));
        await Assert.ThrowsAsync<InvalidOperationException>(() => lease.LoadOffsetAsync("nope", CancellationToken.None));
    }

    [Fact]
    public async Task Offset_only_moves_forward()
    {
        await using IPublisherLease lease = (await new PostgresPublisherLeaseProvider(_db).TryAcquireAsync(CancellationToken.None))!;

        await lease.SaveOffsetAsync(Stream, 10, CancellationToken.None);
        await lease.SaveOffsetAsync(Stream, 5, CancellationToken.None);

        Assert.Equal(10, await lease.LoadOffsetAsync(Stream, CancellationToken.None));
    }

    [Fact]
    public async Task Killed_session_loses_the_lease_and_cannot_save()
    {
        PostgresPublisherLeaseProvider provider = new(_db);
        await using IPublisherLease lease = (await provider.TryAcquireAsync(CancellationToken.None))!;
        await lease.EnsureHeldAsync(CancellationToken.None);

        // What a network partition or a DB failover looks like from the holder's side.
        await ExecAsync(pg.ConnectionString,
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'chess-journal-publisher'");

        await Assert.ThrowsAnyAsync<Exception>(() => lease.EnsureHeldAsync(CancellationToken.None));
        await Assert.ThrowsAnyAsync<Exception>(() => lease.SaveOffsetAsync(Stream, 99, CancellationToken.None));
        await using IPublisherLease? next = await provider.TryAcquireAsync(CancellationToken.None);
        Assert.NotNull(next);
    }

    [Fact]
    public async Task Existing_journal_is_seeded_at_its_head()
    {
        string db = await CreateDatabaseAsync();
        // Shape of the Akka.Persistence.Sql journal as far as the seed cares: schema akka, bigint ordering.
        await ExecAsync(db, "CREATE SCHEMA akka; CREATE TABLE akka.journal (ordering bigint); INSERT INTO akka.journal VALUES (3), (41), (7);");
        await MigrateAsync(db);

        await using IPublisherLease lease = (await new PostgresPublisherLeaseProvider(db).TryAcquireAsync(CancellationToken.None))!;
        Assert.Equal(41, await lease.LoadOffsetAsync(Stream, CancellationToken.None));
    }

    private async Task<string> CreateDatabaseAsync()
    {
        string name = "t" + Guid.NewGuid().ToString("N");
        await ExecAsync(pg.ConnectionString, $"CREATE DATABASE {name}");
        return new NpgsqlConnectionStringBuilder(pg.ConnectionString) { Database = name }.ConnectionString;
    }

    private static async Task MigrateAsync(string connectionString)
    {
        await using ProjectDbContext db = new(new DbContextOptionsBuilder<ProjectDbContext>().UseNpgsql(connectionString).Options);
        await db.Database.MigrateAsync();
    }

    private static async Task ExecAsync(string connectionString, string sql)
    {
        await using NpgsqlConnection c = new(connectionString);
        await c.OpenAsync();
        await using NpgsqlCommand cmd = new(sql, c);
        await cmd.ExecuteNonQueryAsync();
    }
}
