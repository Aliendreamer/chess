namespace Chess.Backend.Data.Models;

/// <summary>
/// A chess news headline (chess-news D1): the source's id, a plain-text title, the https link to the article on the
/// source's site, and when it was published — never the article itself. Kept for <c>News:KeepDays</c>.
/// </summary>
internal sealed class NewsItem
{
    public Guid Id { get; set; }

    /// <summary>The feed's id in <c>News:Feeds</c>, e.g. <c>fide</c>.</summary>
    public required string Source { get; set; }

    public required string Title { get; set; }

    public required string Url { get; set; }

    public DateTimeOffset PublishedAt { get; set; }

    public DateTimeOffset FetchedAt { get; set; }
}
