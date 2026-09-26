using Chess.Backend.Data;
using Chess.Backend.Data.Models;
using Chess.Backend.IntegrationTests.Fixtures;
using Chess.Backend.Utils;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// ROADMAP D11 on real Postgres: the dead-letter id moved from varchar(32) to uuid without losing a parked row,
/// and keyset paging with a uuid tiebreak walks every row exactly once.
/// </summary>
public sealed class DeadLetterSchemaTests(PostgresFixture pg) : IClassFixture<PostgresFixture>
{
    private static readonly DateTimeOffset T0 = DateTimeOffset.Parse("2026-09-25T10:00:00Z", System.Globalization.CultureInfo.InvariantCulture);

    [Fact]
    public async Task A_row_parked_before_the_uuid_migration_survives_it_with_the_same_id()
    {
        string db = await pg.CreateDatabaseAsync(migrate: false);
        await using (ProjectDbContext before = Context(db))
        {
            await before.GetService<IMigrator>().MigrateAsync("AddProjectionDeadLetters");
        }

        Guid id = Guid.CreateVersion7();
        await PostgresFixture.ExecAsync(db, $"""
            INSERT INTO projection_dead_letters ("Id", "GroupId", "AggregateId", "Seq", "KafkaKey", "Value", "Attempts", "LastError", "FirstFailedAt", "ParkedAt")
            VALUES ('{id:N}', 'g', 'a', 7, 'a', '{"{}"}', 5, 'bug', now(), now())
            """);

        await using ProjectDbContext after = Context(db);
        await after.Database.MigrateAsync();

        ProjectionDeadLetter row = await after.ProjectionDeadLetters.AsNoTracking().SingleAsync();
        Assert.Equal((id, 7L), (row.Id, row.Seq));
    }

    [Fact]
    public async Task Keyset_pages_with_a_uuid_tiebreak_walk_every_row_once()
    {
        string db = await pg.CreateDatabaseAsync();
        await using ProjectDbContext ctx = Context(db);
        // Same ParkedAt for three rows, so the uuid tiebreak is what separates the pages.
        List<ProjectionDeadLetter> rows = [.. Enumerable.Range(1, 5).Select(i => new ProjectionDeadLetter
        {
            Id = Guid.CreateVersion7(),
            GroupId = "g",
            AggregateId = $"a{i}",
            Seq = i,
            KafkaKey = $"a{i}",
            Value = "{}",
            Attempts = 5,
            LastError = "bug",
            FirstFailedAt = T0,
            ParkedAt = i <= 3 ? T0 : T0.AddSeconds(i),
        })];
        ctx.ProjectionDeadLetters.AddRange(rows);
        await ctx.SaveChangesAsync();

        List<Guid> walked = [];
        (DateTimeOffset At, Guid Id)? after = null;
        do
        {
            List<ProjectionDeadLetter> page = await ctx.ProjectionDeadLetters.AsNoTracking()
                .NewestFirst(d => d.ParkedAt, d => d.Id, after, limit: 1)
                .ToListAsync();
            CursorPage<ProjectionDeadLetter> cursorPage = Keyset.ToPage(page, 1, d => new KeysetCursor(d.ParkedAt, d.Id.ToString()));
            walked.AddRange(cursorPage.Items.Select(d => d.Id));
            after = KeysetCursor.TryDecodeGuid(cursorPage.NextCursor, out KeysetCursor next, out Guid nextId) ? (next.At, nextId) : null;
        }
        while (after is not null);

        Assert.Equal(5, walked.Count);
        Assert.Equal(rows.Select(r => r.Id).Order(), walked.Order());
    }

    private static ProjectDbContext Context(string connectionString) =>
        new(new DbContextOptionsBuilder<ProjectDbContext>().UseNpgsql(connectionString).Options);
}
