using System.Diagnostics;
using Chess.Backend.IntegrationTests.Fixtures;
using Npgsql;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// What the journal outbox exists for: a ping the actor accepted reaches the read model even when Kafka was
/// down at the time, even when the process that accepted it is gone, and a full replay changes nothing.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class OutboxRecoveryTests(StackFixture stack)
{
    private static readonly TimeSpan ProjectionTimeout = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(4);

    [Fact]
    public async Task Pings_accepted_while_kafka_is_down_are_projected_once_it_is_back()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        string id = Api.NewId("ob");
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);

        await stack.PauseKafkaAsync();
        try
        {
            // The actor no longer touches Kafka, so commands keep succeeding during the outage.
            for (int i = 1; i <= 5; i++)
            {
                await Api.PostPingAsync(client, id, $"down {i}", ct);
            }
        }
        finally
        {
            await stack.UnpauseKafkaAsync();
        }

        PingListItem row = await Api.WaitForPingAsync(client, id, r => r.Count == 5, ProjectionTimeout, ct);
        Assert.Equal(5, row.LastSeq);
        Assert.Equal("down 5", row.LastText);
    }

    [Fact]
    public async Task Pings_persisted_by_a_process_that_is_gone_are_published_by_the_next_one()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        string id = Api.NewId("ob");

        PingApiFactory first = new();
        try
        {
            using HttpClient client = await first.CreateReadyClientAsync(ct);
            // Paused before the command so this process cannot possibly have published it before it exits.
            await stack.PauseKafkaAsync();
            await Api.PostPingAsync(client, id, "orphaned", ct);
        }
        finally
        {
            await first.DisposeAsync();
            await stack.UnpauseKafkaAsync();
        }

        await using PingApiFactory second = new();
        using HttpClient client2 = await second.CreateReadyClientAsync(ct);
        PingListItem row = await Api.WaitForPingAsync(client2, id, r => r.Count == 1, ProjectionTimeout, ct);
        Assert.Equal("orphaned", row.LastText);
    }

    [Fact]
    public async Task Replaying_the_whole_journal_changes_no_read_model()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        string id = Api.NewId("ob");

        await using (PingApiFactory first = new())
        {
            using HttpClient client = await first.CreateReadyClientAsync(ct);
            for (int i = 1; i <= 3; i++)
            {
                await Api.PostPingAsync(client, id, $"r{i}", ct);
            }

            await Api.WaitForPingAsync(client, id, r => r.Count == 3, ProjectionTimeout, ct);
        }

        // A deliberate replay: everything in the journal is produced again.
        await PostgresFixture.ExecAsync(stack.PostgresConnectionString, """UPDATE outbox_offsets SET "LastOrdering" = 0""", ct);

        await using PingApiFactory second = new();
        using HttpClient client2 = await second.CreateReadyClientAsync(ct);
        await EventuallyCaughtUpAsync(ct);
        PingListItem row = await Api.WaitForPingAsync(client2, id, _ => true, ProjectionTimeout, ct);
        Assert.Equal(3, row.Count);
        Assert.Equal(3, row.LastSeq);
        Assert.Equal("r3", row.LastText);
    }

    /// <summary>The replay is done once the saved offset is back at the tagged journal head.</summary>
    private async Task EventuallyCaughtUpAsync(CancellationToken ct)
    {
        Stopwatch elapsed = Stopwatch.StartNew();
        while (elapsed.Elapsed < ProjectionTimeout)
        {
            await using NpgsqlConnection c = new(stack.PostgresConnectionString);
            await c.OpenAsync(ct);
            await using NpgsqlCommand cmd = new(
                """SELECT o."LastOrdering" >= (SELECT COALESCE(max(ordering_id), 0) FROM akka.tags WHERE tag = o."StreamId") FROM outbox_offsets o""",
                c);
            if (await cmd.ExecuteScalarAsync(ct) is true)
            {
                // Give the consumer the same window to apply (and skip) what was just produced.
                await Task.Delay(TimeSpan.FromSeconds(3), ct);
                return;
            }

            await Task.Delay(TimeSpan.FromMilliseconds(500), ct);
        }

        throw new TimeoutException("the publisher did not catch up with the journal after the replay");
    }
}
