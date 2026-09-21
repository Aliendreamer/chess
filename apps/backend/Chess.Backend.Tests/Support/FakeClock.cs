namespace Chess.Backend.Tests.Support;

internal sealed class FakeClock(DateTimeOffset now) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = now;

    public static FakeClock At(string iso) => new(DateTimeOffset.Parse(iso, global::System.Globalization.CultureInfo.InvariantCulture));

    public override DateTimeOffset GetUtcNow() => Now;

    public void Advance(TimeSpan by) => Now += by;
}
