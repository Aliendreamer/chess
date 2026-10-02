using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Xml;

namespace Chess.Backend.News;

/// <summary>What one ask of lichess's broadcast list did (chess-news D6).</summary>
internal enum EventsOutcome
{
    Stored,
    RateLimited,
    Failed,
}

/// <summary>One fetch round, as the <see cref="NewsFetcher"/> singleton runs them (chess-news D1, D6).</summary>
internal interface INewsRounds
{
    /// <summary>Every enabled feed once, then old headlines pruned; a failing feed is counted and skipped.</summary>
    Task FetchFeedsAsync(CancellationToken ct);

    /// <summary>lichess's broadcast list once; on success the stored tournaments are replaced.</summary>
    Task<EventsOutcome> FetchEventsAsync(CancellationToken ct);
}

/// <summary>
/// The news fetches (chess-news D1–D3, D6–D7): one feed at a time with its <c>Accept</c> header, a polite user agent and
/// <c>If-None-Match</c>/<c>If-Modified-Since</c> from the last answer, the body capped at <c>News:MaxFeedBytes</c>, parsed by
/// <see cref="FeedParser"/> and upserted on (source, link). A singleton: the validators it remembers live with it.
/// </summary>
internal sealed class NewsRounds(
    IHttpClientFactory http,
    IServiceScopeFactory scopes,
    IOptions<NewsOptions> options,
    TimeProvider clock,
    ILogger<NewsRounds> logger) : INewsRounds
{
    public const string HttpClientName = "news";
    private const string BroadcastSource = "lichess-broadcasts";
    private static readonly ProductInfoHeaderValue UserAgent = new("ChessClub", "1.0");

    private readonly Dictionary<string, (EntityTagHeaderValue? ETag, DateTimeOffset? LastModified)> _validators = new(StringComparer.Ordinal);

    public async Task FetchFeedsAsync(CancellationToken ct)
    {
        NewsOptions news = options.Value;
        foreach (FeedSource feed in news.Feeds.Where(f => f.Enabled))
        {
            try
            {
                string outcome = await FetchFeedAsync(feed, news, ct);
                NewsMetrics.Fetched(feed.Id, outcome);
            }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException or XmlException or InvalidDataException)
            {
                NewsMetrics.Fetched(feed.Id, "failed");
                Log.NewsFeedFailed(logger, e, feed.Id);
            }
        }

        await PruneAsync(news, ct);
    }

    public async Task<EventsOutcome> FetchEventsAsync(CancellationToken ct)
    {
        NewsOptions news = options.Value;
        try
        {
            using HttpRequestMessage request = new(HttpMethod.Get, news.BroadcastUrl);
            request.Headers.UserAgent.Add(UserAgent);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            if (news.LichessToken.Length > 0)
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", news.LichessToken);
            }

            using HttpResponseMessage response = await Client(news).SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
            {
                NewsMetrics.Fetched(BroadcastSource, "rate_limited");
                return EventsOutcome.RateLimited;
            }

            response.EnsureSuccessStatusCode();
            IReadOnlyList<ChessEvent> events = BroadcastParser.Parse(await ReadCappedAsync(response, news.MaxFeedBytes, ct), clock.GetUtcNow());
            await using AsyncServiceScope scope = scopes.CreateAsyncScope();
            ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
            db.ChessEvents.RemoveRange(await db.ChessEvents.ToListAsync(ct));
            db.ChessEvents.AddRange(events);
            await db.SaveChangesAsync(ct); // one SaveChanges: the old set and the new one swap atomically
            NewsMetrics.Fetched(BroadcastSource, "stored");
            return EventsOutcome.Stored;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or InvalidDataException)
        {
            NewsMetrics.Fetched(BroadcastSource, "failed");
            Log.NewsFeedFailed(logger, e, BroadcastSource);
            return EventsOutcome.Failed;
        }
    }

    private async Task<string> FetchFeedAsync(FeedSource feed, NewsOptions news, CancellationToken ct)
    {
        using HttpRequestMessage request = new(HttpMethod.Get, feed.Url);
        request.Headers.UserAgent.Add(UserAgent);
        if (feed.Accept is { Length: > 0 } accept)
        {
            request.Headers.Accept.ParseAdd(accept);
        }

        if (_validators.TryGetValue(feed.Id, out (EntityTagHeaderValue? ETag, DateTimeOffset? LastModified) seen))
        {
            if (seen.ETag is not null)
            {
                request.Headers.IfNoneMatch.Add(seen.ETag);
            }

            request.Headers.IfModifiedSince = seen.LastModified;
        }

        using HttpResponseMessage response = await Client(news).SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (response.StatusCode == HttpStatusCode.NotModified)
        {
            return "unchanged";
        }

        if (!response.IsSuccessStatusCode)
        {
            Log.NewsFeedRefused(logger, feed.Id, (int)response.StatusCode);
            return $"http_{(int)response.StatusCode}";
        }

        IReadOnlyList<FeedItem> items = FeedParser.Parse(await ReadCappedAsync(response, news.MaxFeedBytes, ct), clock.GetUtcNow());
        await UpsertAsync(feed.Id, items, ct);
        _validators[feed.Id] = (response.Headers.ETag, response.Content.Headers.LastModified);
        return "stored";
    }

    private async Task UpsertAsync(string source, IReadOnlyList<FeedItem> items, CancellationToken ct)
    {
        if (items.Count == 0)
        {
            return;
        }

        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
        List<string> urls = [.. items.Select(i => i.Url)];
        Dictionary<string, NewsItem> known = await db.NewsItems.Where(n => n.Source == source && urls.Contains(n.Url)).ToDictionaryAsync(n => n.Url, StringComparer.Ordinal, ct);
        DateTimeOffset now = clock.GetUtcNow();
        foreach (FeedItem item in items.DistinctBy(i => i.Url, StringComparer.Ordinal))
        {
            if (known.TryGetValue(item.Url, out NewsItem? row))
            {
                row.Title = item.Title;
                row.PublishedAt = item.PublishedAt;
            }
            else
            {
                db.NewsItems.Add(new NewsItem { Id = Guid.CreateVersion7(), Source = source, Title = item.Title, Url = item.Url, PublishedAt = item.PublishedAt, FetchedAt = now });
            }
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task PruneAsync(NewsOptions news, CancellationToken ct)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
        DateTimeOffset cutoff = clock.GetUtcNow().AddDays(-news.KeepDays);
        db.NewsItems.RemoveRange(await db.NewsItems.Where(n => n.PublishedAt < cutoff).ToListAsync(ct));
        await db.SaveChangesAsync(ct);
    }

    private HttpClient Client(NewsOptions news)
    {
        HttpClient client = http.CreateClient(HttpClientName);
        client.Timeout = TimeSpan.FromSeconds(news.TimeoutSeconds);
        return client;
    }

    /// <summary>The body as text, refused once it passes <paramref name="max"/> bytes (a feed is never that large).</summary>
    private static async Task<string> ReadCappedAsync(HttpResponseMessage response, int max, CancellationToken ct)
    {
        if (response.Content.Headers.ContentLength > max)
        {
            throw new InvalidDataException($"Feed larger than {max} bytes.");
        }

        await using Stream body = await response.Content.ReadAsStreamAsync(ct);
        using MemoryStream copy = new();
        byte[] buffer = new byte[16 * 1024];
        int read;
        while ((read = await body.ReadAsync(buffer, ct)) > 0)
        {
            if (copy.Length + read > max)
            {
                throw new InvalidDataException($"Feed larger than {max} bytes.");
            }

            copy.Write(buffer, 0, read);
        }

        return Encoding.UTF8.GetString(copy.GetBuffer(), 0, (int)copy.Length);
    }
}
