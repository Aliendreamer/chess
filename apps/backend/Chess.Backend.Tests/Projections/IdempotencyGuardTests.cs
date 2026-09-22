using Chess.Backend.Projections;

namespace Chess.Backend.Tests.Projections;

public sealed class IdempotencyGuardTests
{
    [Theory]
    // Decision passed by name: SeqDecision is internal and xUnit theory parameters must be public.
    [InlineData(0, 1, nameof(SeqDecision.Apply))]
    [InlineData(3, 4, nameof(SeqDecision.Apply))]
    [InlineData(3, 3, nameof(SeqDecision.Skip))]
    [InlineData(3, 1, nameof(SeqDecision.Skip))]
    [InlineData(3, 5, nameof(SeqDecision.Gap))]
    [InlineData(0, 2, nameof(SeqDecision.Gap))]
    public void Decides_by_high_water_mark(long lastSeq, long seq, string expected) =>
        Assert.Equal(Enum.Parse<SeqDecision>(expected), IdempotencyGuard.Decide(lastSeq, seq));

    [Fact]
    public void Gap_exception_names_the_hole()
    {
        ProjectionGapException ex = new("chess.rm-pings", "p1", 3, 5);
        Assert.Contains("p1", ex.Message, StringComparison.Ordinal);
        Assert.Contains("expected seq 4", ex.Message, StringComparison.Ordinal);
        Assert.Contains("got 5", ex.Message, StringComparison.Ordinal);
    }
}
