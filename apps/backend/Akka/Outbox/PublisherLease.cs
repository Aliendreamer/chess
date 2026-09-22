using Npgsql;

namespace Chess.Backend.Akka.Outbox;

/// <summary>Hands out the one right to publish the journal to Kafka.</summary>
internal interface IPublisherLeaseProvider
{
    /// <summary>The lease, or null when another instance holds it.</summary>
    Task<IPublisherLease?> TryAcquireAsync(CancellationToken ct);
}

/// <summary>
/// Held for as long as this instance may publish. Offsets are read and written through the lease so a lost
/// lease cannot save progress: whoever lost it fails its next save and stops.
/// </summary>
internal interface IPublisherLease : IAsyncDisposable
{
    /// <summary>Last acknowledged journal ordering for <paramref name="streamId"/>; throws if the row is missing.</summary>
    Task<long> LoadOffsetAsync(string streamId, CancellationToken ct);

    /// <summary>Moves the offset forward; a lower value is ignored.</summary>
    Task SaveOffsetAsync(string streamId, long ordering, CancellationToken ct);

    /// <summary>Throws unless the lease is still held right now.</summary>
    Task EnsureHeldAsync(CancellationToken ct);
}

/// <summary>
/// A session-scoped Postgres advisory lock on a dedicated, unpooled connection (design D5). The database is the
/// arbiter: exactly one session can hold the lock, and it is released the moment that session ends — so a
/// partitioned or crashed holder loses it without having to cooperate.
/// </summary>
[ExcludeFromCodeCoverage(Justification = "Raw Npgsql against a live server; proved by PublisherLeaseTests in the integration suite.")]
internal sealed class PostgresPublisherLeaseProvider : IPublisherLeaseProvider
{
    /// <summary>Arbitrary but fixed: every backend must contend for the same key.</summary>
    public const long LockKey = 0x6368_6573_735F_6F62; // "chess_ob"

    public const string ApplicationName = "chess-journal-publisher";

    private readonly string _connectionString;

    public PostgresPublisherLeaseProvider(string connectionString)
    {
        ArgumentException.ThrowIfNullOrEmpty(connectionString);
        _connectionString = new NpgsqlConnectionStringBuilder(connectionString)
        {
            // Pooling off is load-bearing: a pooled "close" keeps the session — and the lock — alive in the pool.
            Pooling = false,
            // Detect a half-dead TCP session in seconds rather than the OS default of hours.
            KeepAlive = 5,
            ApplicationName = ApplicationName,
        }.ConnectionString;
    }

    public async Task<IPublisherLease?> TryAcquireAsync(CancellationToken ct)
    {
        NpgsqlConnection connection = new(_connectionString);
        try
        {
            await connection.OpenAsync(ct);
            await using NpgsqlCommand cmd = new("SELECT pg_try_advisory_lock(@key)", connection);
            cmd.Parameters.AddWithValue("key", LockKey);
            if (await cmd.ExecuteScalarAsync(ct) is true)
            {
                return new Lease(connection);
            }
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }

        await connection.DisposeAsync();
        return null;
    }

    private sealed class Lease(NpgsqlConnection connection) : IPublisherLease
    {
        // One connection, used by the stream's offset saves and the liveness probe; Npgsql connections are
        // not safe for concurrent commands.
        private readonly SemaphoreSlim _gate = new(1, 1);

        public Task<long> LoadOffsetAsync(string streamId, CancellationToken ct) => RunAsync(async () =>
        {
            await using NpgsqlCommand cmd = new("""SELECT "LastOrdering" FROM outbox_offsets WHERE "StreamId" = @s""", connection);
            cmd.Parameters.AddWithValue("s", streamId);
            return await cmd.ExecuteScalarAsync(ct) is long ordering
                ? ordering
                : throw new InvalidOperationException($"No outbox_offsets row for stream '{streamId}'; refusing to publish from 0.");
        }, ct);

        public Task SaveOffsetAsync(string streamId, long ordering, CancellationToken ct) => RunAsync(async () =>
        {
            await using NpgsqlCommand cmd = new(
                """UPDATE outbox_offsets SET "LastOrdering" = @o, "UpdatedAt" = now() WHERE "StreamId" = @s AND "LastOrdering" < @o""",
                connection);
            cmd.Parameters.AddWithValue("o", ordering);
            cmd.Parameters.AddWithValue("s", streamId);
            return await cmd.ExecuteNonQueryAsync(ct);
        }, ct);

        public Task EnsureHeldAsync(CancellationToken ct) => RunAsync(async () =>
        {
            // The advisory key is split across classid (high 32 bits) and objid (low 32 bits).
            await using NpgsqlCommand cmd = new(
                """
                SELECT EXISTS (SELECT 1 FROM pg_locks
                  WHERE locktype = 'advisory' AND granted AND pid = pg_backend_pid()
                    AND ((classid::bigint << 32) | objid::bigint) = @key)
                """,
                connection);
            cmd.Parameters.AddWithValue("key", LockKey);
            return await cmd.ExecuteScalarAsync(ct) is true
                ? true
                : throw new InvalidOperationException("Journal publisher lease is no longer held.");
        }, ct);

        public async ValueTask DisposeAsync()
        {
            // Closing the (unpooled) session releases the advisory lock; no explicit unlock needed.
            await connection.DisposeAsync();
            _gate.Dispose();
        }

        private async Task<T> RunAsync<T>(Func<Task<T>> body, CancellationToken ct)
        {
            await _gate.WaitAsync(ct);
            try
            {
                return await body();
            }
            finally
            {
                _gate.Release();
            }
        }
    }
}
