using System.Text.Json;

namespace Chess.Backend.News;

/// <summary>
/// lichess's <c>api/broadcast/top</c> → the tournaments being played now (chess-news D6): name, place, time control, tier,
/// dates and the current round, with links only to lichess. Images and games are never taken. Pure, tested on a sample.
/// </summary>
internal static class BroadcastParser
{
    private const string LichessBroadcasts = "https://lichess.org/broadcast/";

    /// <summary>The <c>active</c> list; throws <see cref="JsonException"/> when the answer is not JSON.</summary>
    public static IReadOnlyList<ChessEvent> Parse(string json, DateTimeOffset fetchedAt)
    {
        using JsonDocument document = JsonDocument.Parse(json);
        if (document.RootElement.ValueKind != JsonValueKind.Object
            || !document.RootElement.TryGetProperty("active", out JsonElement active)
            || active.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        List<ChessEvent> events = [];
        foreach (JsonElement entry in active.EnumerateArray())
        {
            if (!entry.TryGetProperty("tour", out JsonElement tour)
                || Text(tour, "id") is not { Length: > 0 and <= 32 } id
                || Text(tour, "name") is not { Length: > 0 } name
                || Lichess(Text(tour, "url")) is not { } url)
            {
                continue;
            }

            JsonElement info = tour.TryGetProperty("info", out JsonElement i) ? i : default;
            JsonElement round = entry.TryGetProperty("round", out JsonElement r) ? r : default;
            (DateTimeOffset? starts, DateTimeOffset? ends) = Dates(tour);
            events.Add(new ChessEvent
            {
                Id = id,
                Name = name.Length > 300 ? name[..300] : name,
                Url = url,
                RoundName = round.ValueKind == JsonValueKind.Object ? Cut(Text(round, "name"), 100) : null,
                RoundUrl = round.ValueKind == JsonValueKind.Object ? Lichess(Text(round, "url")) : null,
                Ongoing = round.ValueKind == JsonValueKind.Object && round.TryGetProperty("ongoing", out JsonElement o) && o.ValueKind == JsonValueKind.True,
                Location = info.ValueKind == JsonValueKind.Object ? Cut(Text(info, "location"), 200) : null,
                FideTc = info.ValueKind == JsonValueKind.Object ? Cut(Text(info, "fideTC"), 16) : null,
                Tier = tour.TryGetProperty("tier", out JsonElement t) && t.TryGetInt32(out int tier) ? tier : 0,
                StartsAt = starts,
                EndsAt = ends,
                FetchedAt = fetchedAt,
            });
        }

        return events;
    }

    /// <summary>What home shows: rounds being played first, then the most important, then the earliest to start.</summary>
    public static IReadOnlyList<ChessEvent> Shown(IEnumerable<ChessEvent> events, int count) =>
        [.. events.OrderByDescending(e => e.Ongoing).ThenByDescending(e => e.Tier).ThenBy(e => e.StartsAt ?? DateTimeOffset.MaxValue).Take(count)];

    private static string? Text(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out JsonElement value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    /// <summary>A link kept only when it points into lichess's broadcasts.</summary>
    private static string? Lichess(string? url) =>
        url is not null && url.StartsWith(LichessBroadcasts, StringComparison.Ordinal) && Uri.TryCreate(url, UriKind.Absolute, out _) && url.Length <= 500
            ? url
            : null;

    private static (DateTimeOffset?, DateTimeOffset?) Dates(JsonElement tour)
    {
        if (!tour.TryGetProperty("dates", out JsonElement dates) || dates.ValueKind != JsonValueKind.Array)
        {
            return (null, null);
        }

        List<long> ms = [.. dates.EnumerateArray().Where(d => d.ValueKind == JsonValueKind.Number).Select(d => d.GetInt64())];
        return (ms.Count > 0 ? DateTimeOffset.FromUnixTimeMilliseconds(ms[0]) : null, ms.Count > 1 ? DateTimeOffset.FromUnixTimeMilliseconds(ms[^1]) : null);
    }

    private static string? Cut(string? text, int max) => text is null ? null : text.Length > max ? text[..max] : text;
}
