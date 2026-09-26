namespace Chess.Backend.Tests.Auth;

public sealed class JwtSubjectReaderTests
{
    [Fact]
    public void Reads_sub_from_payload()
    {
        string jwt = Jwt.Unsigned(new { sub = "user-123", exp = 1 });
        Assert.True(JwtSubjectReader.TryReadSubject(jwt, out string? sub));
        Assert.Equal("user-123", sub);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("onlyonepart")]
    [InlineData("a.!!!.c")]
    [InlineData("e30.bm90IGpzb24.")] // payload "not json"
    [InlineData("e30.W10.")] // payload "[]"
    public void Rejects_malformed_tokens(string? jwt)
    {
        Assert.False(JwtSubjectReader.TryReadSubject(jwt, out string? sub));
        Assert.Null(sub);
    }

    [Fact]
    public void Rejects_payload_without_sub()
    {
        Assert.False(JwtSubjectReader.TryReadSubject(Jwt.Unsigned(new { exp = 1 }), out _));
        Assert.False(JwtSubjectReader.TryReadSubject(Jwt.Unsigned(new { sub = 5 }), out _));
        Assert.False(JwtSubjectReader.TryReadSubject(Jwt.Unsigned(new { sub = "" }), out _));
    }
}
