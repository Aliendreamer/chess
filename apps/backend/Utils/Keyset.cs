using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore.Query;

namespace Chess.Backend.Utils;

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
