using System.Net;
using Chess.Backend.News;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace Chess.Backend.Tests.News;

public sealed class NewsRoundsTests
{
    private static readonly DateTimeOffset Now = Time.Utc("2026-10-02T15:00:00Z");

    private static string Sample(string file) => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "News", "Samples", file));

    /// <summary>Answers by URL; records every request so a test can read its headers.</summary>
    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> answer) : HttpMessageHandler
    {
        public List<HttpRequestMessage> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            return Task.FromResult(answer(request));
        }
    }

    private sealed class Factory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private static readonly NewsOptions Options = new()
    {
        Feeds =
        [
            new FeedSource { Id = "fide", Name = "FIDE", Url = "https://feeds.test/fide" },
            new FeedSource { Id = "twic", Name = "TWIC", Url = "https://feeds.test/twic", Accept = "application/rss+xml" },
            new FeedSource { Id = "off", Name = "Off", Url = "https://feeds.test/off", Enabled = false },
        ],
        KeepDays = 30,
        LichessToken = "lip_token",
    };

    private static (NewsRounds Rounds, IServiceProvider Services) Create(FakeHandler handler, NewsOptions? options = null)
    {
        string database = Guid.NewGuid().ToString("N"); // one store for every scope of this test
        ServiceProvider services = new ServiceCollection()
            .AddDbContext<ProjectDbContext>(o => o.UseInMemoryDatabase(database))
            .BuildServiceProvider();
        FakeClock clock = new(Now);
        return (new NewsRounds(new Factory(handler), services.GetRequiredService<IServiceScopeFactory>(), Microsoft.Extensions.Options.Options.Create(options ?? Options), clock, NullLogger<NewsRounds>.Instance), services);
    }

    private static HttpResponseMessage Ok(string body, string? etag = null)
    {
        HttpResponseMessage response = new(HttpStatusCode.OK) { Content = new StringContent(body) };
        if (etag is not null)
        {
            response.Headers.ETag = new System.Net.Http.Headers.EntityTagHeaderValue(etag);
        }

        return response;
    }

    private static async Task<List<NewsItem>> Items(IServiceProvider services)
    {
        using IServiceScope scope = services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ProjectDbContext>().NewsItems.OrderBy(n => n.Source).ThenBy(n => n.Url).ToListAsync();
    }

    [Fact]
    public async Task Every_enabled_feed_is_stored_and_one_failing_feed_does_not_stop_the_others()
    {
        FakeHandler handler = new(r => r.RequestUri!.AbsolutePath == "/fide" ? Ok(Sample("fide.xml")) : new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
        (NewsRounds rounds, IServiceProvider services) = Create(handler);

        await rounds.FetchFeedsAsync(CancellationToken.None);

        List<NewsItem> items = await Items(services);
        Assert.Equal(3, items.Count);
        Assert.All(items, i => Assert.Equal("fide", i.Source));
        Assert.Equal(["/fide", "/twic"], handler.Requests.Select(r => r.RequestUri!.AbsolutePath));
        Assert.Contains("application/rss+xml", handler.Requests[1].Headers.Accept.ToString(), StringComparison.Ordinal);
        Assert.StartsWith("ChessClub/", handler.Requests[0].Headers.UserAgent.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_second_round_updates_instead_of_duplicating_and_sends_the_etag()
    {
        FakeHandler handler = new(r => r.RequestUri!.AbsolutePath == "/fide" ? Ok(Sample("fide.xml"), "\"v1\"") : Ok(Sample("twic.xml")));
        (NewsRounds rounds, IServiceProvider services) = Create(handler);

        await rounds.FetchFeedsAsync(CancellationToken.None);
        await rounds.FetchFeedsAsync(CancellationToken.None);

        Assert.Equal(6, (await Items(services)).Count);
        Assert.Equal("\"v1\"", handler.Requests[2].Headers.IfNoneMatch.ToString());
    }

    [Fact]
    public async Task Headlines_older_than_the_keep_days_are_pruned()
    {
        FakeHandler handler = new(_ => new HttpResponseMessage(HttpStatusCode.NotModified));
        (NewsRounds rounds, IServiceProvider services) = Create(handler);
        using (IServiceScope scope = services.CreateScope())
        {
            ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
            db.NewsItems.AddRange(
                new NewsItem { Id = Guid.NewGuid(), Source = "fide", Title = "old", Url = "https://x.test/old", PublishedAt = Now.AddDays(-31), FetchedAt = Now.AddDays(-31) },
                new NewsItem { Id = Guid.NewGuid(), Source = "fide", Title = "new", Url = "https://x.test/new", PublishedAt = Now.AddDays(-1), FetchedAt = Now.AddDays(-1) });
            await db.SaveChangesAsync();
        }

        await rounds.FetchFeedsAsync(CancellationToken.None);

        Assert.Equal(["new"], (await Items(services)).Select(i => i.Title));
    }

    [Fact]
    public async Task A_feed_larger_than_the_cap_is_refused()
    {
        FakeHandler handler = new(_ => Ok(Sample("fide.xml")));
        (NewsRounds rounds, IServiceProvider services) = Create(handler, new NewsOptions { Feeds = [Options.Feeds[0]], MaxFeedBytes = 1000 });

        await rounds.FetchFeedsAsync(CancellationToken.None);

        Assert.Empty(await Items(services));
    }

    [Fact]
    public async Task Events_replace_the_snapshot_send_the_token_and_report_a_rate_limit()
    {
        HttpStatusCode status = HttpStatusCode.OK;
        FakeHandler handler = new(_ => status == HttpStatusCode.OK ? Ok(Sample("broadcasts.json")) : new HttpResponseMessage(status));
        (NewsRounds rounds, IServiceProvider services) = Create(handler);

        Assert.Equal(EventsOutcome.Stored, await rounds.FetchEventsAsync(CancellationToken.None));
        status = HttpStatusCode.TooManyRequests;
        Assert.Equal(EventsOutcome.RateLimited, await rounds.FetchEventsAsync(CancellationToken.None));

        using IServiceScope scope = services.CreateScope();
        Assert.Equal(4, await scope.ServiceProvider.GetRequiredService<ProjectDbContext>().ChessEvents.CountAsync()); // the old snapshot stays
        Assert.Equal("Bearer lip_token", handler.Requests[0].Headers.Authorization?.ToString());
    }
}
