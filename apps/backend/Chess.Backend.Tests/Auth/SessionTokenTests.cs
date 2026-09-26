namespace Chess.Backend.Tests.Auth;

public sealed class SessionTokenTests
{
    [Fact]
    public void Generate_is_256_bits_of_base64url_and_unique()
    {
        string a = SessionToken.Generate();
        string b = SessionToken.Generate();

        Assert.Equal(43, a.Length); // 32 bytes → 43 unpadded base64url chars
        Assert.DoesNotContain('=', a);
        Assert.DoesNotContain('+', a);
        Assert.DoesNotContain('/', a);
        Assert.NotEqual(a, b);
    }

    [Fact]
    public void Hash_is_deterministic_sha256_hex_and_differs_from_input()
    {
        string raw = SessionToken.Generate();
        string h1 = SessionToken.Hash(raw);
        string h2 = SessionToken.Hash(raw);

        Assert.Equal(h1, h2);
        Assert.Equal(64, h1.Length);
        Assert.NotEqual(raw, h1);
        Assert.NotEqual(h1, SessionToken.Hash(raw + "x"));
    }

    [Fact]
    public void Hash_is_lower_case_sha256_hex_of_the_utf8_token() =>
        Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", SessionToken.Hash("abc"));

    [Fact]
    public void Hash_rejects_empty() => Assert.Throws<ArgumentException>(() => SessionToken.Hash(string.Empty));
}
