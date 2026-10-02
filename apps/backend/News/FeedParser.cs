using System.Globalization;
using System.Net;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;

namespace Chess.Backend.News;

/// <summary>A headline as the club keeps it (chess-news D3): plain-text title, an https link, a date. Nothing else.</summary>
internal sealed record FeedItem(string Title, string Url, DateTimeOffset PublishedAt);

/// <summary>
/// RSS 2.0 and Atom → headlines (chess-news D3), trusting nothing: DTDs and entities are refused (no XXE), titles lose
/// their markup and are cut to <see cref="MaxTitle"/>, an item whose link is not absolute https is dropped, and a date
/// is RFC 822, ISO 8601 or TWIC's <c>ddd MMM d HH:mm:ss yyyy</c> — else the fetch time. Pure, tested on saved samples.
/// </summary>
internal static partial class FeedParser
{
    public const int MaxTitle = 300;

    private static readonly XNamespace Atom = "http://www.w3.org/2005/Atom";

    private static readonly XmlReaderSettings Safe = new()
    {
        DtdProcessing = DtdProcessing.Prohibit,
        XmlResolver = null,
        IgnoreComments = true,
        IgnoreProcessingInstructions = true,
    };

    /// <summary>The feed's items; empty when the document is no feed. Throws <see cref="XmlException"/> on a DTD or bad XML.</summary>
    public static IReadOnlyList<FeedItem> Parse(string xml, DateTimeOffset fetchedAt)
    {
        ArgumentNullException.ThrowIfNull(xml);
        XDocument document;
        using (StringReader text = new(xml))
        using (XmlReader reader = XmlReader.Create(text, Safe))
        {
            document = XDocument.Load(reader);
        }

        IEnumerable<FeedItem?> items = document.Root?.Name.LocalName switch
        {
            "rss" => document.Descendants("item").Select(i => Item(
                (string?)i.Element("title"), (string?)i.Element("link"), (string?)i.Element("pubDate"), fetchedAt)),
            "feed" => document.Root.Elements(Atom + "entry").Select(e => Item(
                (string?)e.Element(Atom + "title"),
                AtomLink(e),
                (string?)e.Element(Atom + "published") ?? (string?)e.Element(Atom + "updated"),
                fetchedAt)),
            _ => [],
        };
        return [.. items.OfType<FeedItem>()];
    }

    private static string? AtomLink(XElement entry) =>
        entry.Elements(Atom + "link")
            .Where(l => (string?)l.Attribute("rel") is null or "alternate")
            .Select(l => (string?)l.Attribute("href"))
            .FirstOrDefault();

    private static FeedItem? Item(string? rawTitle, string? rawLink, string? rawDate, DateTimeOffset fetchedAt)
    {
        string title = Clean(rawTitle);
        string link = (rawLink ?? string.Empty).Trim();
        if (title.Length == 0 || !Uri.TryCreate(link, UriKind.Absolute, out Uri? url) || url.Scheme != Uri.UriSchemeHttps)
        {
            return null;
        }

        return new FeedItem(title, url.AbsoluteUri, DateOf(rawDate) ?? fetchedAt);
    }

    /// <summary>Markup stripped, entities decoded, whitespace collapsed, cut to <see cref="MaxTitle"/>.</summary>
    private static string Clean(string? raw)
    {
        string text = WebUtility.HtmlDecode(Tags().Replace(raw ?? string.Empty, string.Empty));
        text = Spaces().Replace(text, " ").Trim();
        return text.Length > MaxTitle ? text[..MaxTitle] : text;
    }

    private static DateTimeOffset? DateOf(string? raw)
    {
        string text = (raw ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return null;
        }

        if (DateTimeOffset.TryParseExact(text, ["ddd MMM d HH:mm:ss yyyy", "ddd MMM dd HH:mm:ss yyyy"], CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AllowWhiteSpaces, out DateTimeOffset twic))
        {
            return twic.ToUniversalTime();
        }

        return DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out DateTimeOffset parsed)
            ? parsed.ToUniversalTime()
            : null;
    }

    [GeneratedRegex("<[^>]*>")]
    private static partial Regex Tags();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();
}
