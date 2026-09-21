using System.Security.Cryptography;
using System.Text;

namespace Chess.Backend.Tests.Auth;

public sealed class PkceTests
{
    [Fact]
    public void Create_produces_s256_challenge_of_verifier()
    {
        PkceValues pkce = Pkce.Create();

        string expected = Base64Url.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(pkce.Verifier)));
        Assert.Equal(expected, pkce.Challenge);
        Assert.Equal(43, pkce.Verifier.Length);
        Assert.NotEmpty(pkce.Nonce);
        Assert.NotEqual(Pkce.Create().Verifier, pkce.Verifier);
    }

    [Fact]
    public void Cookie_value_round_trips()
    {
        PkceValues pkce = Pkce.Create();

        Assert.True(PkceValues.TryParseCookieValue(pkce.ToCookieValue(), out string nonce, out string verifier));
        Assert.Equal(pkce.Nonce, nonce);
        Assert.Equal(pkce.Verifier, verifier);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("noseparator")]
    [InlineData(".verifier")]
    [InlineData("nonce.")]
    public void Malformed_cookie_values_are_rejected(string? value)
    {
        Assert.False(PkceValues.TryParseCookieValue(value, out _, out _));
    }

    [Fact]
    public void ComputeChallenge_rejects_empty() =>
        Assert.Throws<ArgumentException>(() => Pkce.ComputeChallenge(string.Empty));
}
