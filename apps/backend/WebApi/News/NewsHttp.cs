namespace Chess.Backend.WebApi.News;

/// <summary>A headline as members see it (chess-news): the source's name, the title, the link out, when it was published.</summary>
internal sealed record NewsItemView(Guid Id, string Source, string SourceName, string Title, string Url, DateTimeOffset PublishedAt);

/// <summary>A tournament being played now (chess-news D6), with lichess links only.</summary>
internal sealed record ChessEventView(
    string Id,
    string Name,
    string Url,
    string? RoundName,
    string? RoundUrl,
    bool Ongoing,
    string? Location,
    string? FideTc,
    DateTimeOffset? StartsAt,
    DateTimeOffset? EndsAt);

internal static class NewsHttp
{
    /// <summary>Headlines change every half hour at most: an answer may be reused for five minutes.</summary>
    public const string CacheControl = "private, max-age=300";

    /// <summary>Events older than this are not shown: lichess has been unreachable for a while.</summary>
    public static readonly TimeSpan EventsStaleAfter = TimeSpan.FromHours(1);
}
