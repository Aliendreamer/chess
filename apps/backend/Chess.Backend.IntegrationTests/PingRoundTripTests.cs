using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Chess.Backend.IntegrationTests.Fixtures;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// The whole Part 0 spine in two tests: command → actor → journal → Kafka → projection → read model,
/// and then the same entity recovered from the journal by a fresh process.
/// </summary>
public sealed class PingRoundTripTests(StackFixture stack) : IClassFixture<StackFixture>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan ProjectionTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);

    private sealed record PingState(string PingId, long Count, string? LastText, DateTimeOffset? LastAt, long LastSeq);

    private sealed record PingListItem(string PingId, long Count, string? LastText, DateTimeOffset? LastAt, long LastSeq);

    private sealed record PingListResponse(IReadOnlyList<PingListItem> Items, int Page, int PageSize);

    [Fact]
    public async Task A_ping_is_answered_by_the_actor_and_shows_up_in_the_read_model()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        string id = $"it-{Guid.NewGuid():N}"[..20];
        await using PingApiFactory app = new(stack);
        using HttpClient client = app.CreateClient();

        HttpResponseMessage posted = await client.PostAsJsonAsync(
            $"/api/pings/{id}",
            new { text = "round trip" },
            Json,
            ct);

        Assert.Equal(HttpStatusCode.OK, posted.StatusCode);
        PingState? state = await posted.Content.ReadFromJsonAsync<PingState>(Json, ct);
        Assert.NotNull(state);
        Assert.Equal(1, state.Count);
        Assert.Equal("round trip", state.LastText);

        // Eventually consistent on purpose: the row only appears once the Kafka consumer has projected it.
        PingListItem projected = await Eventually(client, id, ct);
        Assert.Equal(1, projected.Count);
        Assert.Equal("round trip", projected.LastText);
    }

    [Fact]
    public async Task A_restarted_node_recovers_the_entity_from_the_journal()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        string id = $"it-{Guid.NewGuid():N}"[..20];
        await using (PingApiFactory first = new(stack))
        {
            using HttpClient client = first.CreateClient();
            HttpResponseMessage posted = await client.PostAsJsonAsync(
                $"/api/pings/{id}",
                new { text = "before restart" },
                Json,
                ct);
            Assert.Equal(HttpStatusCode.OK, posted.StatusCode);
        }

        // Same containers, same journal, a brand new ActorSystem: the count must survive.
        await using PingApiFactory second = new(stack);
        using HttpClient client2 = second.CreateClient();
        PingState? recovered = await client2.GetFromJsonAsync<PingState>(
            $"/api/pings/{id}/live",
            Json,
            ct);

        Assert.NotNull(recovered);
        Assert.Equal(1, recovered.Count);
        Assert.Equal("before restart", recovered.LastText);
    }

    private static async Task<PingListItem> Eventually(HttpClient client, string id, CancellationToken ct)
    {
        Stopwatch elapsed = Stopwatch.StartNew();
        while (elapsed.Elapsed < ProjectionTimeout)
        {
            PingListResponse? list = await client.GetFromJsonAsync<PingListResponse>(
                "/api/pings?page=1&pageSize=200",
                Json,
                ct);
            PingListItem? found = list?.Items.FirstOrDefault(i => string.Equals(i.PingId, id, StringComparison.Ordinal));
            if (found is not null)
            {
                return found;
            }

            await Task.Delay(TimeSpan.FromMilliseconds(250), ct);
        }

        throw new TimeoutException($"ping '{id}' never reached rm_pings within {ProjectionTimeout.TotalSeconds:F0}s");
    }
}
