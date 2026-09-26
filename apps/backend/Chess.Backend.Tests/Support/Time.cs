using System.Globalization;

namespace Chess.Backend.Tests.Support;

internal static class Time
{
    /// <summary>Parses an ISO-8601 instant, culture-invariantly.</summary>
    public static DateTimeOffset Utc(string iso) => DateTimeOffset.Parse(iso, CultureInfo.InvariantCulture);
}
