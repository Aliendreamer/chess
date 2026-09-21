namespace Chess.Backend.Tests.Auth;

public sealed class OidcStateCodecTests
{
    [Fact]
    public void Round_trips_nonce_and_return_to()
    {
        OidcState state = new("n0nce", "/games/42?tab=moves");

        string encoded = OidcStateCodec.Encode(state);
        Assert.DoesNotContain('=', encoded);
        Assert.True(OidcStateCodec.TryDecode(encoded, out OidcState? decoded));
        Assert.Equal(state, decoded);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("!!!not-base64url!!!")]
    [InlineData("bm90IGpzb24")] // "not json"
    [InlineData("e30")] // "{}" → no nonce
    public void Rejects_garbage(string? encoded)
    {
        Assert.False(OidcStateCodec.TryDecode(encoded, out OidcState? state));
        Assert.Null(state);
    }

    [Fact]
    public void Rejects_json_array()
    {
        string encoded = Base64Url.Encode("[1,2]"u8);
        Assert.False(OidcStateCodec.TryDecode(encoded, out _));
    }
}
