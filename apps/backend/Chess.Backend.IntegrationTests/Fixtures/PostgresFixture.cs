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
}
