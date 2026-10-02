using System.Text.Json;
using Chess.Backend.News;

namespace Chess.Backend.Tests.News;

public sealed class BroadcastParserTests
{
    private static readonly DateTimeOffset Fetched = Time.Utc("2026-10-02T15:00:00Z");

    private static string Sample() => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "News", "Samples", "broadcasts.json"));

    [Fact]
    public void The_active_tournaments_keep_names_place_time_control_round_and_links()
    {
        IReadOnlyList<ChessEvent> events = BroadcastParser.Parse(Sample(), Fetched);

        Assert.Equal(4, events.Count);
        ChessEvent first = events[0];
        Assert.Equal(("2aIImqz1", "rapid", 4, "Round 1", false), (first.Id, first.FideTc, first.Tier, first.RoundName, first.Ongoing));
        Assert.StartsWith("2026 Army and Navy Club Pall Mall Masters", first.Name, StringComparison.Ordinal);
        Assert.StartsWith("https://lichess.org/broadcast/", first.Url, StringComparison.Ordinal);
        Assert.StartsWith("https://lichess.org/broadcast/", first.RoundUrl, StringComparison.Ordinal);
        Assert.Equal(DateTimeOffset.FromUnixTimeMilliseconds(1791018000000), first.StartsAt);
        Assert.Equal(Fetched, first.FetchedAt);
    }

    [Fact]
    public void Only_lichess_links_are_kept_and_images_never()
    {
        const string json = """
            { "active": [
              { "tour": { "id": "a1", "name": "Elsewhere", "url": "https://evil.example/x", "tier": 5, "image": "https://image.lichess1.org/x" } },
              { "tour": { "id": "b2", "name": "Good", "url": "https://lichess.org/broadcast/good/b2", "tier": 3 },
                "round": { "name": "Round 2", "url": "javascript:alert(1)", "ongoing": true } }
            ] }
            """;

        ChessEvent only = Assert.Single(BroadcastParser.Parse(json, Fetched));

        Assert.Equal(("b2", null, true), (only.Id, only.RoundUrl, only.Ongoing));
    }

    [Fact]
    public void Not_json_or_no_active_list_is_no_events()
    {
        Assert.ThrowsAny<JsonException>(() => BroadcastParser.Parse("<html>blocked</html>", Fetched));
        Assert.Empty(BroadcastParser.Parse("""{ "upcoming": [] }""", Fetched));
    }

    [Fact]
    public void Home_shows_live_rounds_first_then_the_most_important_then_the_earliest()
    {
        ChessEvent Event(string id, bool ongoing, int tier, int startDay) => new()
        {
            Id = id,
            Name = id,
            Url = "https://lichess.org/broadcast/" + id,
            Ongoing = ongoing,
            Tier = tier,
            StartsAt = Time.Utc("2026-10-01T00:00:00Z").AddDays(startDay),
        };
        List<ChessEvent> events = [Event("calm-top", false, 5, 0), Event("live-low", true, 2, 3), Event("calm-low-early", false, 2, 0), Event("live-top", true, 5, 1), Event("calm-low-late", false, 2, 2)];

        Assert.Equal(["live-top", "live-low", "calm-top", "calm-low-early"], BroadcastParser.Shown(events, 4).Select(e => e.Id));
    }
}
