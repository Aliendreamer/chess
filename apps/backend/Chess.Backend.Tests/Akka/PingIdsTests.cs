using Chess.Backend.Akka.Ping;

namespace Chess.Backend.Tests.Akka;

public sealed class PingIdsTests
{
    [Fact]
    public void Valid_id_is_returned_unchanged()
    {
        Assert.Equal("p1", PingIds.Validate("p1"));
        Assert.Equal("abc-123", PingIds.Validate("abc-123"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("UPPER")]
    [InlineData("has space")]
    [InlineData("a/b")]
    public void Invalid_id_throws(string? pingId)
    {
        Assert.Throws<ArgumentException>(() => PingIds.Validate(pingId));
    }

    [Fact]
    public void Id_longer_than_64_chars_throws()
    {
        string tooLong = new('a', 65);
        Assert.Throws<ArgumentException>(() => PingIds.Validate(tooLong));
    }
}
