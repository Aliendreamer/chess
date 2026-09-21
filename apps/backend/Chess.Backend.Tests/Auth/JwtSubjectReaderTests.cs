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

    [Fact]
    public void Rejects_non_json_payload()
    {
        string header = Base64Url.Encode("{}"u8);
        string payload = Base64Url.Encode("not json"u8);
        Assert.False(JwtSubjectReader.TryReadSubject($"{header}.{payload}.", out _));
    }

    [Fact]
    public void Rejects_array_payload()
    {
        string header = Base64Url.Encode("{}"u8);
        string payload = Base64Url.Encode("[]"u8);
        Assert.False(JwtSubjectReader.TryReadSubject($"{header}.{payload}.", out _));
    }
}
