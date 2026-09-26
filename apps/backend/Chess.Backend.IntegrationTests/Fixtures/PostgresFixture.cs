using Chess.Backend.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Testcontainers.PostgreSql;

namespace Chess.Backend.IntegrationTests.Fixtures;

/// <summary>Postgres alone, for tests that prove database behaviour and need neither Redpanda nor the app.</summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18")
        .WithDatabase("chess")
        .WithUsername("chess")
        .WithPassword("chess")
        .Build();

    public string ConnectionString => _postgres.GetConnectionString();

    public Task InitializeAsync() => _postgres.StartAsync();

    public Task DisposeAsync() => _postgres.DisposeAsync().AsTask();

    /// <summary>
    /// A fresh database on the shared container (one per test, so nothing leaks between them), migrated to the
    /// latest schema unless <paramref name="migrate"/> is false. Returns its connection string.
    /// </summary>
    public async Task<string> CreateDatabaseAsync(bool migrate = true)
    {
        string name = "t" + Guid.NewGuid().ToString("N");
        await ExecAsync(ConnectionString, $"CREATE DATABASE {name}");
        string connectionString = new NpgsqlConnectionStringBuilder(ConnectionString) { Database = name }.ConnectionString;
        if (migrate)
        {
            await MigrateAsync(connectionString);
        }

        return connectionString;
    }

    public static async Task MigrateAsync(string connectionString)
    {
        await using ProjectDbContext db = new(new DbContextOptionsBuilder<ProjectDbContext>().UseNpgsql(connectionString).Options);
        await db.Database.MigrateAsync();
    }

    public static async Task ExecAsync(string connectionString, string sql, CancellationToken ct = default)
    {
        await using NpgsqlConnection c = new(connectionString);
        await c.OpenAsync(ct);
        await using NpgsqlCommand cmd = new(sql, c);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
