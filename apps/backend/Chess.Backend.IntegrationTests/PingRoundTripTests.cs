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
[Collection(StackFixture.Collection)]
public sealed class PingRoundTripTests
{
    // The fixture is what configures the app (env vars the host reads at startup); the tests only need
    // it to have run, not to read from it.
    public PingRoundTripTests(StackFixture stack) => ArgumentNullException.ThrowIfNull(stack);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan ProjectionTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);

    private sealed record PingState(string PingId, long Count, string? LastText, DateTimeOffset? LastAt, long LastSeq);

    private sealed record PingListItem(string PingId, long Count, string? LastText, DateTimeOffset? LastAt, long LastSeq, DateTimeOffset UpdatedAt);

    private sealed record PingListResponse(IReadOnlyList<PingListItem> Items, string? NextCursor, int Limit);

    [Fact]
    public async Task A_ping_is_answered_by_the_actor_and_shows_up_in_the_read_model()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        string id = $"it-{Guid.NewGuid():N}"[..20];
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);

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
    public async Task The_list_walks_every_row_once_by_cursor_and_rejects_a_forged_one()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        string[] ids = [.. Enumerable.Range(0, 3).Select(_ => $"it-{Guid.NewGuid():N}"[..20])];
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        foreach (string id in ids)
        {
            HttpResponseMessage posted = await client.PostAsJsonAsync($"/api/pings/{id}", new { text = "paged" }, Json, ct);
            Assert.Equal(HttpStatusCode.OK, posted.StatusCode);
        }

        foreach (string id in ids)
        {
            _ = await Eventually(client, id, ct);
        }

        // limit=1 makes every row its own page, so the seek predicate (the row-value comparison) runs each hop.
        List<PingListItem> walked = [];
        string? cursor = null;
        do
        {
            string url = cursor is null ? "/api/pings?limit=1" : $"/api/pings?limit=1&cursor={Uri.EscapeDataString(cursor)}";
            PingListResponse? page = await client.GetFromJsonAsync<PingListResponse>(url, Json, ct);
            Assert.NotNull(page);
            Assert.Equal(1, page.Limit);
            walked.AddRange(page.Items);
            cursor = page.NextCursor;
        }
        while (cursor is not null);

        Assert.Equal(walked.Count, walked.Select(i => i.PingId).Distinct(StringComparer.Ordinal).Count());
        Assert.All(ids, id => Assert.Contains(walked, i => string.Equals(i.PingId, id, StringComparison.Ordinal)));
        Assert.True(walked.Zip(walked.Skip(1)).All(p => p.Item1.UpdatedAt >= p.Item2.UpdatedAt), "newest first");

        HttpResponseMessage forged = await client.GetAsync(new Uri("/api/pings?cursor=bm9wZQ", UriKind.Relative), ct);
        Assert.Equal(HttpStatusCode.BadRequest, forged.StatusCode);
    }

    [Fact]
    public async Task A_restarted_node_recovers_the_entity_from_the_journal()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        string id = $"it-{Guid.NewGuid():N}"[..20];
        await using (PingApiFactory first = new())
        {
            using HttpClient client = await first.CreateReadyClientAsync(ct);
            HttpResponseMessage posted = await client.PostAsJsonAsync(
                $"/api/pings/{id}",
                new { text = "before restart" },
                Json,
                ct);
            Assert.Equal(HttpStatusCode.OK, posted.StatusCode);
        }

        // Same containers, same journal, a brand new ActorSystem: the count must survive.
        await using PingApiFactory second = new();
        using HttpClient client2 = await second.CreateReadyClientAsync(ct);
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
                "/api/pings?limit=200",
                Json,
                ct);
            PingListItem? found = list?.Items.FirstOrDefault(i => string.Equals(i.PingId, id, StringComparison.Ordinal));
            if (found is not null)
            {
                return found;
            }

            await Task.Delay(TimeSpan.FromMilliseconds(500), ct);
        }

        throw new TimeoutException($"ping '{id}' never reached rm_pings within {ProjectionTimeout.TotalSeconds:F0}s");
    }
}
