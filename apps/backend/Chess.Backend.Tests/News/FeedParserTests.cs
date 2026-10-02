using System.Xml;
using Chess.Backend.News;

namespace Chess.Backend.Tests.News;

public sealed class FeedParserTests
{
    private static readonly DateTimeOffset Fetched = Time.Utc("2026-10-02T15:00:00Z");

    private static string Sample(string file) => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "News", "Samples", file));

    [Theory]
    [InlineData("fide.xml", "Small Nations Chess Association restarts activities and elects new Board", "https://www.fide.com/small-nations-chess-association-restarts-activities-and-elects-new-board/", "2026-10-02T13:26:42Z")]
    [InlineData("chessbase.xml", "Jon Speelman at 70: A leading figure of English chess", "https://en.chessbase.com/post/jon-speelman-70th-birthday", "2026-10-02T14:00:00Z")]
    [InlineData("twic.xml", "46th World Chess Olympiad 2026 - Games and Results", "https://theweekinchess.com/chessnews/events/46th-world-chess-olympiad-2026", "2026-09-17T20:10:00Z")]
    [InlineData("ecf.xml", "Coaching blind players", "https://www.englishchess.org.uk/coaching-blind-players/", "2026-09-30T08:21:32Z")]
    [InlineData("lichess.xml", "Streamer Arenas Announcement — August to December 2026", "https://lichess.org/@/Lichess/blog/streamer-arenas-announcement-august-to-december-2026/tkby72bI", "2026-08-16T19:40:30.817Z")]
    public void Each_feed_gives_its_headlines_links_and_dates(string file, string title, string url, string published)
    {
        IReadOnlyList<FeedItem> items = FeedParser.Parse(Sample(file), Fetched);

        Assert.Equal(3, items.Count);
        Assert.Equal((title, url, Time.Utc(published)), (items[0].Title, items[0].Url, items[0].PublishedAt));
    }

    [Fact]
    public void An_entity_declaration_rejects_the_whole_feed()
    {
        const string hostile = """
            <?xml version="1.0"?>
            <!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
            <rss version="2.0"><channel><item><title>&xxe;</title><link>https://example.org/a</link></item></channel></rss>
            """;

        Assert.ThrowsAny<XmlException>(() => FeedParser.Parse(hostile, Fetched));
    }

    [Fact]
    public void Titles_are_plain_text_and_only_https_links_are_kept()
    {
        const string feed = """
            <rss version="2.0"><channel>
              <item><title><![CDATA[<b>Gukesh</b> wins &amp; leads]]></title><link>https://example.org/a</link></item>
              <item><title>Script</title><link>javascript:alert(1)</link></item>
              <item><title>Plain http</title><link>http://example.org/b</link></item>
              <item><title>   </title><link>https://example.org/c</link></item>
            </channel></rss>
            """;

        FeedItem item = Assert.Single(FeedParser.Parse(feed, Fetched));

        Assert.Equal(("Gukesh wins & leads", "https://example.org/a", Fetched), (item.Title, item.Url, item.PublishedAt));
    }

    [Fact]
    public void A_long_title_is_cut()
    {
        string feed = $"<rss version=\"2.0\"><channel><item><title>{new string('x', 500)}</title><link>https://example.org/a</link></item></channel></rss>";

        Assert.Equal(FeedParser.MaxTitle, Assert.Single(FeedParser.Parse(feed, Fetched)).Title.Length);
    }

    [Fact]
    public void Something_that_is_not_a_feed_has_no_items()
    {
        Assert.Empty(FeedParser.Parse("<html><body>blocked</body></html>", Fetched));
    }
}
