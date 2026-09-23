using System.Linq.Expressions;

namespace Chess.Backend.Tests.Utils;

public sealed class KeysetTests
{
    private sealed record Row(string Id, DateTimeOffset At);

    private static readonly DateTimeOffset T0 = new(2026, 9, 23, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(0, Keyset.MaxLimit, Keyset.DefaultLimit)]
    [InlineData(-3, Keyset.MaxLimit, Keyset.DefaultLimit)]
    [InlineData(10, Keyset.MaxLimit, 10)]
    [InlineData(10_000, Keyset.MaxLimit, Keyset.MaxLimit)]
    [InlineData(999, 200, 200)]
    [InlineData(0, 20, 20)]
    public void ClampLimit_defaults_and_bounds(int requested, int max, int expected) =>
        Assert.Equal(expected, Keyset.ClampLimit(requested, max));

    [Fact]
    public void Cursor_round_trips_exactly()
    {
        KeysetCursor cursor = new(T0.AddTicks(1234567), "ping|with|bars");
        Assert.True(KeysetCursor.TryDecode(cursor.Encode(), out KeysetCursor back));
        Assert.Equal(cursor, back);
        Assert.Equal(TimeSpan.Zero, back.At.Offset);
    }

    [Fact]
    public void Cursor_normalises_the_offset_to_utc()
    {
        KeysetCursor local = new(new DateTimeOffset(2026, 9, 23, 14, 0, 0, TimeSpan.FromHours(2)), "a");
        Assert.True(KeysetCursor.TryDecode(local.Encode(), out KeysetCursor back));
        Assert.Equal(local.At, back.At);
        Assert.Equal(TimeSpan.Zero, back.At.Offset);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not base64url!")]
    [InlineData("MTIz")] // "123": no separator
    [InlineData("fGlk")] // "|id": no ticks
    [InlineData("MTIzfA")] // "123|": no id
    [InlineData("LTF8aWQ")] // "-1|id"
    [InlineData("YWJjfGlk")] // "abc|id"
    [InlineData("NDAwMDAwMDAwMDAwMDAwMDAwMHxpZA")] // ticks past DateTimeOffset.MaxValue
    [InlineData("OTk5OTk5OTk5OTk5OTk5OTk5OTl8aWQ")] // ticks overflow long
    public void Cursor_rejects_garbage(string? encoded) =>
        Assert.False(KeysetCursor.TryDecode(encoded, out _));

    [Fact]
    public void Cursor_rejects_oversized_input() =>
        Assert.False(KeysetCursor.TryDecode(new string('A', KeysetCursor.MaxEncodedLength + 4), out _));

    [Fact]
    public void ToPage_without_a_look_ahead_row_is_the_last_page()
    {
        Row[] rows = [new("b", T0), new("a", T0)];
        CursorPage<Row> page = Keyset.ToPage(rows, 2, r => new KeysetCursor(r.At, r.Id));
        Assert.Equal(rows, page.Items);
        Assert.Null(page.NextCursor);
        Assert.Equal(2, page.Limit);
    }

    [Fact]
    public void ToPage_drops_the_look_ahead_row_and_points_at_the_last_kept_one()
    {
        Row[] rows = [new("c", T0.AddSeconds(2)), new("b", T0.AddSeconds(1)), new("a", T0)];
        CursorPage<Row> page = Keyset.ToPage(rows, 2, r => new KeysetCursor(r.At, r.Id));
        Assert.Equal(["c", "b"], page.Items.Select(r => r.Id));
        Assert.True(KeysetCursor.TryDecode(page.NextCursor, out KeysetCursor next));
        Assert.Equal(new KeysetCursor(T0.AddSeconds(1), "b"), next);
    }

    [Fact]
    public void NewestFirst_orders_by_time_then_id_and_takes_one_extra()
    {
        IQueryable<Row> source = new[]
        {
            new Row("a", T0), new Row("c", T0.AddSeconds(1)), new Row("b", T0.AddSeconds(1)), new Row("d", T0.AddSeconds(-1)),
        }.AsQueryable();

        List<Row> rows = [.. source.NewestFirst(r => r.At, r => r.Id, after: null, limit: 2)];

        Assert.Equal(["c", "b", "a"], rows.Select(r => r.Id));
    }

    [Fact]
    public void Before_is_one_row_value_comparison_over_a_single_row_parameter()
    {
        Expression<Func<Row, bool>> before = Keyset.Before<Row>(r => r.At, x => x.Id, new KeysetCursor(T0, "b"));

        MethodCallExpression call = Assert.IsAssignableFrom<MethodCallExpression>(before.Body);
        Assert.Equal(nameof(NpgsqlDbFunctionsExtensions.LessThan), call.Method.Name);
        Assert.Equal(typeof(NpgsqlDbFunctionsExtensions), call.Method.DeclaringType);
        ParameterExpression only = Assert.Single(before.Parameters);
        Assert.All(ParameterCollector.Collect(before.Body), p => Assert.Same(only, p));
    }

    private sealed class ParameterCollector : ExpressionVisitor
    {
        private readonly List<ParameterExpression> _seen = [];

        public static List<ParameterExpression> Collect(Expression e)
        {
            ParameterCollector c = new();
            c.Visit(e);
            return c._seen;
        }

        protected override Expression VisitParameter(ParameterExpression node)
        {
            _seen.Add(node);
            return node;
        }
    }
}
