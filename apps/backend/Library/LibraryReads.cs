using System.Globalization;
using System.Text;

namespace Chess.Backend.Library;

/// <summary>A library search (game-library D5): every field optional; text fields match part of the name, any case.</summary>
internal sealed record LibrarySearch(
    string? Player = null,
    string? Event = null,
    int? From = null,
    int? To = null,
    string? Result = null,
    bool? WorldChampionship = null,
    string? Eco = null,
    string? Opening = null);

/// <summary>Where a page of the newest-year-first list ends; a game without a year sorts as year −1, after all others.</summary>
internal sealed record LibraryCursor(int Year, Guid Id)
{
    public static LibraryCursor After(LibraryGame game)
    {
        ArgumentNullException.ThrowIfNull(game);
        return new(game.Year ?? -1, game.Id);
    }

    public string Encode() => System.Buffers.Text.Base64Url.EncodeToString(Encoding.UTF8.GetBytes($"{Year.ToString(CultureInfo.InvariantCulture)}|{Id:N}"));

    /// <summary>True for no cursor (the first page) and for a cursor this API wrote; false for anything else.</summary>
    public static bool TryDecode(string? text, out LibraryCursor? cursor)
    {
        cursor = null;
        if (string.IsNullOrEmpty(text))
        {
            return true;
        }

        try
        {
            string[] parts = Encoding.UTF8.GetString(System.Buffers.Text.Base64Url.DecodeFromChars(text)).Split('|');
            if (parts.Length == 2 && int.TryParse(parts[0], NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out int year)
                && Guid.TryParseExact(parts[1], "N", out Guid id))
            {
                cursor = new LibraryCursor(year, id);
                return true;
            }
        }
        catch (FormatException)
        {
            // not base64url: refused below
        }

        return false;
    }
}

/// <summary>How the library games at one position ended.</summary>
internal sealed record PositionCounts(int Games, int WhiteWins, int Draws, int BlackWins);

/// <summary>
/// The library's reads (game-library D5), over <see cref="IQueryable{T}"/>. Text filters use Postgres <c>ILIKE</c>, which
/// the trigram indexes answer; the others are plain comparisons, so they are also tested in memory.
/// </summary>
internal static class LibraryReads
{
    public static IQueryable<LibraryGame> Filter(IQueryable<LibraryGame> games, LibrarySearch search)
    {
        ArgumentNullException.ThrowIfNull(games);
        ArgumentNullException.ThrowIfNull(search);
        if (Pattern(search.Player) is { } player)
        {
            games = games.Where(g => EF.Functions.ILike(g.White, player) || EF.Functions.ILike(g.Black, player));
        }

        if (Pattern(search.Event) is { } eventName)
        {
            games = games.Where(g => g.Event != null && EF.Functions.ILike(g.Event, eventName));
        }

        if (Pattern(search.Opening) is { } opening)
        {
            games = games.Where(g => g.OpeningName != null && EF.Functions.ILike(g.OpeningName, opening));
        }

        if (search.From is { } from)
        {
            games = games.Where(g => g.Year >= from);
        }

        if (search.To is { } to)
        {
            games = games.Where(g => g.Year <= to);
        }

        if (search.Result is { Length: > 0 } result)
        {
            games = games.Where(g => g.Result == result);
        }

        if (search.WorldChampionship == true)
        {
            games = games.Where(g => g.WorldChampionship);
        }

        if (search.Eco is { Length: > 0 } eco)
        {
            string prefix = eco.ToUpperInvariant();
            games = games.Where(g => g.Eco != null && g.Eco.StartsWith(prefix));
        }

        return games;
    }

    /// <summary>Newest year first (no year last), then id; seeks past <paramref name="after"/> and takes one extra row.</summary>
    public static IQueryable<LibraryGame> NewestYearFirst(this IQueryable<LibraryGame> games, LibraryCursor? after, int limit)
    {
        ArgumentNullException.ThrowIfNull(games);
        if (after is { } c)
        {
            games = games.Where(g => (g.Year ?? -1) < c.Year || ((g.Year ?? -1) == c.Year && g.Id.CompareTo(c.Id) < 0));
        }

        return games.OrderByDescending(g => g.Year ?? -1).ThenByDescending(g => g.Id).Take(limit + 1);
    }

    public static PositionCounts Count(IReadOnlyCollection<string> results)
    {
        ArgumentNullException.ThrowIfNull(results);
        return new(
            results.Count,
            results.Count(r => r == "1-0"),
            results.Count(r => r == "1/2-1/2"),
            results.Count(r => r == "0-1"));
    }

    /// <summary><c>%text%</c> for ILIKE with the user's wildcards escaped; null when there is nothing to match.</summary>
    private static string? Pattern(string? text) =>
        string.IsNullOrWhiteSpace(text)
            ? null
            : $"%{text.Trim().Replace("\\", "\\\\", StringComparison.Ordinal).Replace("%", "\\%", StringComparison.Ordinal).Replace("_", "\\_", StringComparison.Ordinal)}%";
}
