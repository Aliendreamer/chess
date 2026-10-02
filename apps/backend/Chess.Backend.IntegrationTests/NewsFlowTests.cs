using System.Net;
using System.Net.Http.Json;
using Chess.Backend.IntegrationTests.Fixtures;
using Chess.Backend.News;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// chess-news end to end on Postgres: a fetch round through the real <see cref="INewsRounds"/> (its HTTP client answered
/// by a fake: one feed up, the others down) stores the headlines, the API lists them by source, and a lichess broadcast
/// answer becomes Events now. The fetcher itself is off in tests (News__Enabled=false).
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class NewsFlowTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(2);

    private const string Rss = """
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0"><channel><title>FIDE</title>
          <item><title>Candidates 2027: venue announced</title><link>https://www.fide.com/candidates-2027-venue</link><pubDate>Fri, 02 Oct 2026 13:26:42 +0000</pubDate></item>
          <item><title><![CDATA[<b>Olympiad</b> &amp; more]]></title><link>https://www.fide.com/olympiad</link><pubDate>Thu, 01 Oct 2026 10:00:00 +0000</pubDate></item>
        </channel></rss>
        """;

    private const string Broadcasts = """
        { "active": [ { "tour": { "id": "abc123", "name": "Test Open 2026", "url": "https://lichess.org/broadcast/test-open/abc123", "tier": 4,
                         "info": { "location": "Geneva", "fideTC": "standard" }, "dates": [1790000000000] },
                        "round": { "name": "Round 3", "url": "https://lichess.org/broadcast/test-open/round-3/r3", "ongoing": true } } ] }
        """;

    private sealed class FakeFeeds : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            string host = request.RequestUri!.Host;
            HttpResponseMessage response = host switch
            {
                "www.fide.com" => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Rss) },
                "lichess.org" when request.RequestUri.AbsolutePath.StartsWith("/api/broadcast", StringComparison.Ordinal) =>
                    new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Broadcasts) },
                _ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable),
            };
            return Task.FromResult(response);
        }
    }

    private sealed record Page<T>(IReadOnlyList<T> Items, string? NextCursor, int Limit);

    private sealed record Item(string Source, string SourceName, string Title, string Url);

    private sealed record Source(string Id, string Name);

    private sealed record Event(string Id, string Name, string? RoundName, bool Ongoing, string? Location, string? FideTc);

    [Fact]
    public async Task A_round_stores_headlines_and_events_that_the_api_lists()
    {
        ArgumentNullException.ThrowIfNull(stack);
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new(services =>
            services.AddHttpClient(NewsRounds.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => new FakeFeeds()));
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        INewsRounds rounds = app.Services.GetRequiredService<INewsRounds>();

        await rounds.FetchFeedsAsync(ct);
        Assert.Equal(EventsOutcome.Stored, await rounds.FetchEventsAsync(ct));

        using (HttpResponseMessage r = await Api.GetAsync(client, "/api/news?source=fide", "reader", ct))
        {
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            Page<Item> page = (await r.Content.ReadFromJsonAsync<Page<Item>>(Api.Json, ct))!;
            Assert.Equal(["Candidates 2027: venue announced", "Olympiad & more"], page.Items.Select(i => i.Title));
            Assert.All(page.Items, i => Assert.Equal(("fide", "FIDE"), (i.Source, i.SourceName)));
        }

        using (HttpResponseMessage r = await Api.GetAsync(client, "/api/news/sources", "reader", ct))
        {
            List<Source> sources = (await r.Content.ReadFromJsonAsync<List<Source>>(Api.Json, ct))!;
            Assert.Equal(["fide", "chessbase", "lichess", "twic", "ecf"], sources.Select(s => s.Id));
        }

        using (HttpResponseMessage r = await Api.GetAsync(client, "/api/news/events", "reader", ct))
        {
            Event only = Assert.Single((await r.Content.ReadFromJsonAsync<List<Event>>(Api.Json, ct))!);
            Assert.Equal(("abc123", "Test Open 2026", "Round 3", true, "Geneva", "standard"), (only.Id, only.Name, only.RoundName, only.Ongoing, only.Location, only.FideTc));
        }
    }
}
