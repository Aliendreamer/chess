namespace Chess.Backend.Tests.Auth;

public sealed class Base64UrlTests
{
    [Fact]
    public void Round_trips_bytes_without_padding()
    {
        byte[] bytes = [0xfb, 0xff, 0xbf, 0x00, 0x01];
        string encoded = Base64Url.Encode(bytes);

        Assert.DoesNotContain('=', encoded);
        Assert.DoesNotContain('+', encoded);
        Assert.DoesNotContain('/', encoded);
        Assert.True(Base64Url.TryDecode(encoded, out byte[]? decoded));
        Assert.Equal(bytes, decoded);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("###")]
    public void Rejects_invalid_input(string? text)
    {
        Assert.False(Base64Url.TryDecode(text, out byte[]? bytes));
        Assert.Null(bytes);
    }
}
