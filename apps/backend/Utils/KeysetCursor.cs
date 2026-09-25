using System.Globalization;
using System.Text;

namespace Chess.Backend.Utils;

/// <summary>
/// Position after the last row of a page, sorted by <c>(At, Id)</c>. Travels as opaque base64url of
/// <c>"&lt;utc ticks&gt;|&lt;id&gt;"</c>; built only from values read back from the DB, so it round-trips exactly.
/// </summary>
internal readonly record struct KeysetCursor(DateTimeOffset At, string Id)
{
    internal const int MaxEncodedLength = 256;

    public string Encode() =>
        Base64Url.Encode(Encoding.UTF8.GetBytes(string.Create(CultureInfo.InvariantCulture, $"{At.UtcTicks}|{Id}")));

    public static bool TryDecode(string? encoded, out KeysetCursor cursor)
    {
        cursor = default;
        if (encoded is not { Length: <= MaxEncodedLength } || !Base64Url.TryDecode(encoded, out byte[]? bytes))
        {
            return false;
        }

        string raw = Encoding.UTF8.GetString(bytes);
        int bar = raw.IndexOf('|', StringComparison.Ordinal);
        if (bar <= 0 || bar == raw.Length - 1
            || !long.TryParse(raw.AsSpan(0, bar), NumberStyles.None, CultureInfo.InvariantCulture, out long ticks)
            || ticks > DateTimeOffset.MaxValue.UtcTicks)
        {
            return false;
        }

        cursor = new KeysetCursor(new DateTimeOffset(ticks, TimeSpan.Zero), raw[(bar + 1)..]);
        return true;
    }

    /// <summary>Decodes a cursor whose id must be a <see cref="Guid"/> (a <c>uuid</c>-keyed list, ROADMAP D11).</summary>
    public static bool TryDecodeGuid(string? encoded, out KeysetCursor cursor, out Guid id)
    {
        id = Guid.Empty;
        return TryDecode(encoded, out cursor) && Guid.TryParse(cursor.Id, out id);
    }
}
