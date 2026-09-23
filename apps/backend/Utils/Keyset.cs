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

    // Compiled by C# (not hand-built) so the ITuple boxing is exactly what Npgsql's row-value translator
    // expects: WHERE (at, id) < (@at, @id).
    private static readonly Expression<Func<DateTimeOffset, string, KeysetCursor, bool>> BeforeTemplate =
        (at, id, c) => EF.Functions.LessThan(ValueTuple.Create(at, id), ValueTuple.Create(c.At, c.Id));

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
        int limit)
    {
        ArgumentNullException.ThrowIfNull(at);
        ArgumentNullException.ThrowIfNull(id);
        IQueryable<T> query = after is { } cursor ? source.Where(Before(at, id, cursor)) : source;
        return query.OrderByDescending(at).ThenByDescending(id).Take(limit + 1);
    }

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
        KeysetCursor cursor)
    {
        ParameterExpression row = at.Parameters[0];
        Expression idBody = ReplacingExpressionVisitor.Replace(id.Parameters[0], row, id.Body);
        Expression boxed = Expression.Property(Expression.Constant(new CursorBox(cursor)), nameof(CursorBox.Value));
        Expression body = new ReplacingExpressionVisitor(BeforeTemplate.Parameters, [at.Body, idBody, boxed])
            .Visit(BeforeTemplate.Body);
        return Expression.Lambda<Func<T, bool>>(body, row);
    }

    // A reference holder, so EF sees a closure-style member access and turns the cursor into SQL parameters.
    private sealed class CursorBox(KeysetCursor value)
    {
        public KeysetCursor Value { get; } = value;
    }
}
