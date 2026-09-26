using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Chess.Backend.IntegrationTests.Fixtures;

/// <summary>A row of <c>GET /api/pings</c>, as the client sees it.</summary>
public sealed record PingListItem(string PingId, long Count, string? LastText, DateTimeOffset? LastAt, long LastSeq, DateTimeOffset UpdatedAt);

public sealed record PingListResponse(IReadOnlyList<PingListItem> Items, string? NextCursor, int Limit);

/// <summary>
/// Stateless HTTP and polling helpers shared by the integration tests. Nothing here holds state or touches the
/// process environment, so it is safe from any test class, in or out of the <see cref="StackFixture"/> collection.
/// </summary>
public static class Api
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// How often the read model is polled over HTTP. Not tighter: TestServer has no remote IP, so every request
    /// shares the rate limiter's single "anonymous" partition (300/min).
    /// </summary>
    private static readonly TimeSpan ReadModelPoll = TimeSpan.FromMilliseconds(500);

    /// <summary>A valid, unique ping id (lower case, 20 chars).</summary>
    public static string NewId(string prefix = "it") => $"{prefix}-{Guid.NewGuid():N}"[..20];

    public static async Task PostPingAsync(HttpClient client, string id, string text, CancellationToken ct)
    {
        using HttpResponseMessage posted = await client.PostAsJsonAsync($"/api/pings/{id}", new { text }, Json, ct);
        Assert.Equal(HttpStatusCode.OK, posted.StatusCode);
    }

    /// <summary>Polls the ping list until <paramref name="id"/> is there and satisfies <paramref name="done"/>.</summary>
    public static async Task<PingListItem> WaitForPingAsync(
        HttpClient client, string id, Func<PingListItem, bool> done, TimeSpan timeout, CancellationToken ct)
    {
        Stopwatch elapsed = Stopwatch.StartNew();
        PingListItem? last = null;
        while (elapsed.Elapsed < timeout)
        {
            PingListResponse? list = await client.GetFromJsonAsync<PingListResponse>("/api/pings?limit=200", Json, ct);
            last = list?.Items.FirstOrDefault(i => string.Equals(i.PingId, id, StringComparison.Ordinal));
            if (last is not null && done(last))
            {
                return last;
            }

            await Task.Delay(ReadModelPoll, ct);
        }

        throw new TimeoutException($"ping '{id}' not projected as expected within {timeout.TotalSeconds:F0}s; last: {last}");
    }

    /// <summary>Polls <paramref name="condition"/> every <paramref name="poll"/> (default 250 ms) until it holds.</summary>
    public static async Task EventuallyAsync(
        Func<Task<bool>> condition, string what, TimeSpan timeout, CancellationToken ct, TimeSpan? poll = null)
    {
        Stopwatch elapsed = Stopwatch.StartNew();
        while (elapsed.Elapsed < timeout)
        {
            if (await condition())
            {
                return;
            }

            await Task.Delay(poll ?? TimeSpan.FromMilliseconds(250), ct);
        }

        throw new TimeoutException($"not within {timeout.TotalSeconds:F0}s: {what}");
    }
}
