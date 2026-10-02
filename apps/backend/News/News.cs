using System.Diagnostics.Metrics;
using System.Text.RegularExpressions;
using Chess.Backend.Extensions;

namespace Chess.Backend.News;

/// <summary>One configured feed (chess-news D2): headlines and links only are ever kept from it.</summary>
internal sealed class FeedSource
{
    /// <summary>A short stable id stored on every item, e.g. <c>fide</c>.</summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>The name members see, e.g. "FIDE".</summary>
    public string Name { get; set; } = string.Empty;

    public string Url { get; set; } = string.Empty;

    /// <summary>An <c>Accept</c> header for feeds that insist on one (TWIC answers 406 without it).</summary>
    public string? Accept { get; set; }

    public bool Enabled { get; set; } = true;
}

/// <summary>Section <c>News</c> (chess-news).</summary>
internal sealed partial class NewsOptions : ISettings
{
    public const string SectionName = "News";

    /// <summary>The fetcher runs; integration tests turn it off so they never reach the internet.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>The feeds; empty by default in code (the binder appends onto a non-empty array default), listed in the file.</summary>
    public List<FeedSource> Feeds { get; set; } = [];

    /// <summary>How often the feeds are fetched.</summary>
    public int FetchMinutes { get; set; } = 30;

    /// <summary>How long a headline is kept.</summary>
    public int KeepDays { get; set; } = 30;

    /// <summary>A feed larger than this is refused.</summary>
    public int MaxFeedBytes { get; set; } = 2_000_000;

    /// <summary>A feed slower than this is skipped until the next round.</summary>
    public int TimeoutSeconds { get; set; } = 10;

    /// <summary>How often lichess's broadcast list is asked (Events now).</summary>
    public int EventsMinutes { get; set; } = 10;

    /// <summary>How many tournaments home shows.</summary>
    public int EventsShown { get; set; } = 5;

    public string BroadcastUrl { get; set; } = "https://lichess.org/api/broadcast/top?page=1";

    /// <summary>A lichess personal token, sent as a bearer token when set (env var only; never in a file).</summary>
    public string LichessToken { get; set; } = string.Empty;

    public void Validate()
    {
        if (FetchMinutes <= 0 || KeepDays <= 0 || MaxFeedBytes <= 0 || TimeoutSeconds <= 0 || EventsMinutes <= 0 || EventsShown <= 0)
        {
            throw new InvalidOperationException("News: every interval, limit and count must be positive.");
        }

        if (!IsHttps(BroadcastUrl))
        {
            throw new InvalidOperationException("News:BroadcastUrl must be an https URL.");
        }

        HashSet<string> ids = new(StringComparer.Ordinal);
        foreach (FeedSource feed in Feeds)
        {
            if (!FeedId().IsMatch(feed.Id) || !ids.Add(feed.Id))
            {
                throw new InvalidOperationException($"News:Feeds: '{feed.Id}' must be a unique id of a-z, 0-9 and dashes.");
            }

            if (string.IsNullOrWhiteSpace(feed.Name) || !IsHttps(feed.Url))
            {
                throw new InvalidOperationException($"News:Feeds:{feed.Id} needs a name and an https URL.");
            }
        }
    }

    private static bool IsHttps(string url) => Uri.TryCreate(url, UriKind.Absolute, out Uri? u) && u.Scheme == Uri.UriSchemeHttps;

    [GeneratedRegex("^[a-z0-9-]{1,32}$")]
    private static partial Regex FeedId();
}

/// <summary>Meter <c>chess.news</c>: every fetch by source (a feed id, or <c>lichess-broadcasts</c>) and outcome.</summary>
internal static class NewsMetrics
{
    public const string MeterName = "chess.news";

    private static readonly Meter Meter = new(MeterName);
    private static readonly Counter<long> Fetches = Meter.CreateCounter<long>("chess.news.fetch", description: "Feed fetches by source and outcome");

    public static void Fetched(string source, string outcome) =>
        Fetches.Add(1, new KeyValuePair<string, object?>("source", source), new KeyValuePair<string, object?>("outcome", outcome));
}
