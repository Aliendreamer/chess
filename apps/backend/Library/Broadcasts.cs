using System.Text;
using System.Text.RegularExpressions;
using Chess.Backend.Extensions;
using ZstdSharp;

namespace Chess.Backend.Library;

/// <summary>
/// A lichess broadcast file (broadcast-explorer D2): <c>lichess_db_broadcast_YYYY-MM.pgn.zst</c>, written by pzstd as a
/// skippable frame ahead of each of several zstd frames. Decoded as a stream, so a month never sits in memory.
/// </summary>
internal static class BroadcastFile
{
    public static TextReader Open(Stream compressed) =>
        new StreamReader(new DecompressionStream(compressed), Encoding.UTF8, detectEncodingFromByteOrderMarks: false);
}

/// <summary>Section <c>LibraryBroadcasts</c> (broadcast-explorer D1, D4, D7): which lichess broadcast games the library keeps.</summary>
internal sealed class LibraryBroadcastsOptions : ISettings
{
    public const string SectionName = "LibraryBroadcasts";

    /// <summary>Both players must be rated at least this; a game without both ratings is dropped.</summary>
    public int MinElo { get; set; } = 2400;

    /// <summary>Drop games whose time control reads as under 10 minutes; an unknown time control is kept.</summary>
    public bool ExcludeFast { get; set; } = true;

    /// <summary>Positions stored per broadcast game: its opening, not its endgame.</summary>
    public int PositionPlies { get; set; } = 40;

    /// <summary>Games per import transaction.</summary>
    public int BatchSize { get; set; } = 500;

    /// <summary>Where the monthly files are: <c>{BaseUrl}lichess_db_broadcast_YYYY-MM.pgn.zst</c>.</summary>
    public string BaseUrl { get; set; } = "https://database.lichess.org/broadcast/";

    /// <summary>The first month published.</summary>
    public string FirstMonth { get; set; } = "2020-01";

    /// <summary>How long one month's download may take.</summary>
    public int DownloadTimeoutMinutes { get; set; } = 30;

    public void Validate()
    {
        if (MinElo < 0 || PositionPlies <= 0 || BatchSize <= 0 || DownloadTimeoutMinutes <= 0)
        {
            throw new InvalidOperationException("LibraryBroadcasts: MinElo must not be negative; PositionPlies, BatchSize and DownloadTimeoutMinutes must be positive.");
        }

        if (!Uri.TryCreate(BaseUrl, UriKind.Absolute, out Uri? url) || url.Scheme != Uri.UriSchemeHttps || !BaseUrl.EndsWith('/'))
        {
            throw new InvalidOperationException("LibraryBroadcasts:BaseUrl must be an https URL ending in '/'.");
        }

        if (!BroadcastFilter.IsMonth(FirstMonth))
        {
            throw new InvalidOperationException("LibraryBroadcasts:FirstMonth must be YYYY-MM.");
        }
    }
}

/// <summary>
/// Which broadcast games the library keeps and how they map onto a library game (broadcast-explorer D4, D5), pure: a
/// finished standard game from the start, both players rated at least <see cref="LibraryBroadcastsOptions.MinElo"/>,
/// and not blitz or bullet when <see cref="LibraryBroadcastsOptions.ExcludeFast"/> is on.
/// </summary>
internal static partial class BroadcastFilter
{
    public const string Source = "lichess broadcasts";
    public const string Licence = "CC BY-SA 4.0";

    public static bool IsMonth(string? month) => month is not null && MonthPattern().IsMatch(month);

    public static bool Keeps(IReadOnlyDictionary<string, string> headers, LibraryBroadcastsOptions options)
    {
        ArgumentNullException.ThrowIfNull(headers);
        ArgumentNullException.ThrowIfNull(options);
        string? variant = headers.GetValueOrDefault("Variant");
        return (string.IsNullOrEmpty(variant) || variant == "Standard")
            && !headers.ContainsKey("FEN") && !headers.ContainsKey("SetUp")
            && headers.GetValueOrDefault("Result") is "1-0" or "0-1" or "1/2-1/2"
            && Rated(headers.GetValueOrDefault("WhiteElo"), options.MinElo)
            && Rated(headers.GetValueOrDefault("BlackElo"), options.MinElo)
            && !(options.ExcludeFast && BaseMinutes(headers.GetValueOrDefault("TimeControl")) < 10);
    }

    /// <summary>A kept game as the library stores it: named by its tournament, linked to its lichess page.</summary>
    public static ImportGame ToImport(PgnGame game, IReadOnlyList<string> uci)
    {
        ArgumentNullException.ThrowIfNull(game);
        IReadOnlyDictionary<string, string> h = game.Headers;
        return new ImportGame(
            h.GetValueOrDefault("White", string.Empty),
            h.GetValueOrDefault("Black", string.Empty),
            h.GetValueOrDefault("BroadcastName") ?? h.GetValueOrDefault("Event"),
            Site: null,
            h.GetValueOrDefault("Round"),
            h.GetValueOrDefault("Date"),
            h.GetValueOrDefault("Result", "*"),
            h.GetValueOrDefault("ECO"),
            uci,
            StartFen: null,
            SourceRef: h.GetValueOrDefault("GameURL"));
    }

    /// <summary>
    /// The base time in minutes, or null when it cannot be read (kept). <c>N</c> or <c>N+M</c> is minutes under 180 and
    /// seconds from 180; <c>H:MM:SS</c>, <c>Nmin…</c> and <c>N'</c> are understood.
    /// </summary>
    public static double? BaseMinutes(string? timeControl)
    {
        if (string.IsNullOrWhiteSpace(timeControl))
        {
            return null;
        }

        string tc = timeControl.Trim();
        if (ClockPattern().Match(tc) is { Success: true } clock)
        {
            return (int.Parse(clock.Groups[1].ValueSpan, System.Globalization.CultureInfo.InvariantCulture) * 60)
                + int.Parse(clock.Groups[2].ValueSpan, System.Globalization.CultureInfo.InvariantCulture);
        }

        if (MinutesPattern().Match(tc) is { Success: true } minutes)
        {
            return int.Parse(minutes.Groups[1].ValueSpan, System.Globalization.CultureInfo.InvariantCulture);
        }

        if (PlainPattern().Match(tc) is { Success: true } plain)
        {
            int n = int.Parse(plain.Groups[1].ValueSpan, System.Globalization.CultureInfo.InvariantCulture);
            return n < 180 ? n : n / 60.0; // 180 and up are seconds: no game starts with three hours
        }

        return null;
    }

    private static bool Rated(string? elo, int min) =>
        int.TryParse(elo, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out int rating) && rating >= min;

    [GeneratedRegex(@"^20\d\d-(0[1-9]|1[0-2])$")]
    private static partial Regex MonthPattern();

    [GeneratedRegex(@"^(\d{1,2}):(\d\d)(:\d\d)?\b")]
    private static partial Regex ClockPattern();

    [GeneratedRegex(@"^(\d+)\s*(min|')", RegexOptions.IgnoreCase)]
    private static partial Regex MinutesPattern();

    [GeneratedRegex(@"^(\d+)(\s*\+\s*\d+)?$")]
    private static partial Regex PlainPattern();
}
