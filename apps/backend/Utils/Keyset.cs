using System.Globalization;
using System.Linq.Expressions;
using System.Text;
using Microsoft.EntityFrameworkCore.Query;

namespace Chess.Backend.Utils;

/// <summary>One page of a keyset-paged list. <see cref="NextCursor"/> is null on the last page.</summary>
internal sealed record CursorPage<T>(IReadOnlyList<T> Items, string? NextCursor, int Limit);

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

/// <summary>
/// Keyset (cursor) paging, newest first. Every list endpoint pages this way — no Skip/Take: rows that move
/// while someone pages (a sort key that is updated) are neither repeated nor skipped out from under them.
/// </summary>
internal static class Keyset
{
    public const int DefaultLimit = 50;
    public const int MaxLimit = 500;

    public static int ClampLimit(int requested, int max = MaxLimit) =>
        Math.Clamp(requested <= 0 ? Math.Min(DefaultLimit, max) : requested, 1, max);

    /// <summary>
    /// Orders by <c>(at DESC, id DESC)</c>, seeks past <paramref name="after"/>, and takes one extra row so
    /// <see cref="ToPage"/> can tell whether another page exists. Wants an index on <c>(at, id)</c>.
    /// Postgres only (row-value comparison).
    /// </summary>
    public static IQueryable<T> NewestFirst<T>(
        this IQueryable<T> source,
        Expression<Func<T, DateTimeOffset>> at,
        Expression<Func<T, string>> id,
        KeysetCursor? after,
        int limit) =>
        source.NewestFirst(at, id, after is { } c ? (c.At, c.Id) : null, limit);

    /// <summary>
    /// The same, with a <c>uuid</c> tiebreak (ROADMAP D11). The endpoint validates the cursor with
    /// <see cref="KeysetCursor.TryDecodeGuid"/> and passes the parsed id here.
    /// </summary>
    public static IQueryable<T> NewestFirst<T>(
        this IQueryable<T> source,
        Expression<Func<T, DateTimeOffset>> at,
        Expression<Func<T, Guid>> id,
        (DateTimeOffset At, Guid Id)? after,
        int limit) =>
        source.NewestFirst<T, Guid>(at, id, after, limit);

    /// <summary>Trims the look-ahead row from a <see cref="NewestFirst"/> result and derives the next cursor.</summary>
    public static CursorPage<T> ToPage<T>(IReadOnlyList<T> rows, int limit, Func<T, KeysetCursor> keyOf)
    {
        ArgumentNullException.ThrowIfNull(rows);
        ArgumentNullException.ThrowIfNull(keyOf);
        if (rows.Count <= limit)
        {
            return new CursorPage<T>(rows, null, limit);
        }

        List<T> items = [.. rows.Take(limit)];
        return new CursorPage<T>(items, keyOf(items[^1]).Encode(), limit);
    }

    internal static Expression<Func<T, bool>> Before<T>(
        Expression<Func<T, DateTimeOffset>> at,
        Expression<Func<T, string>> id,
        KeysetCursor cursor) =>
        Before<T, string>(at, id, cursor.At, cursor.Id);

    internal static Expression<Func<T, bool>> Before<T>(
        Expression<Func<T, DateTimeOffset>> at,
        Expression<Func<T, Guid>> id,
        DateTimeOffset afterAt,
        Guid afterId) =>
        Before<T, Guid>(at, id, afterAt, afterId);

    private static IQueryable<T> NewestFirst<T, TId>(
        this IQueryable<T> source,
        Expression<Func<T, DateTimeOffset>> at,
        Expression<Func<T, TId>> id,
        (DateTimeOffset At, TId Id)? after,
        int limit)
    {
        ArgumentNullException.ThrowIfNull(at);
        ArgumentNullException.ThrowIfNull(id);
        IQueryable<T> query = after is { } cursor ? source.Where(Before(at, id, cursor.At, cursor.Id)) : source;
        return query.OrderByDescending(at).ThenByDescending(id).Take(limit + 1);
    }

    private static Expression<Func<T, bool>> Before<T, TId>(
        Expression<Func<T, DateTimeOffset>> at,
        Expression<Func<T, TId>> id,
        DateTimeOffset afterAt,
        TId afterId)
    {
        ParameterExpression row = at.Parameters[0];
        Expression idBody = ReplacingExpressionVisitor.Replace(id.Parameters[0], row, id.Body);
        CursorBox<TId> box = new(afterAt, afterId);
        Expression boxedAt = Expression.Property(Expression.Constant(box), nameof(CursorBox<TId>.At));
        Expression boxedId = Expression.Property(Expression.Constant(box), nameof(CursorBox<TId>.Id));
        Expression body = new ReplacingExpressionVisitor(Template<TId>.Before.Parameters, [at.Body, idBody, boxedAt, boxedId])
            .Visit(Template<TId>.Before.Body);
        return Expression.Lambda<Func<T, bool>>(body, row);
    }

    // Compiled by C# (not hand-built) so the ITuple boxing is exactly what Npgsql's row-value translator
    // expects: WHERE (at, id) < (@at, @id). One template per id type (text or uuid).
    private static class Template<TId>
    {
        public static readonly Expression<Func<DateTimeOffset, TId, DateTimeOffset, TId, bool>> Before =
            (at, id, afterAt, afterId) => EF.Functions.LessThan(ValueTuple.Create(at, id), ValueTuple.Create(afterAt, afterId));
    }

    // A reference holder, so EF sees a closure-style member access and turns the cursor into SQL parameters.
    private sealed class CursorBox<TId>(DateTimeOffset at, TId id)
    {
        public DateTimeOffset At { get; } = at;

        public TId Id { get; } = id;
    }
}
