namespace Chess.Backend.Tests.Auth;

public sealed class PkceTests
{
    [Fact]
    public void Create_produces_s256_challenge_of_verifier()
    {
        PkceValues pkce = Pkce.Create();

        Assert.Equal(Pkce.ComputeChallenge(pkce.Verifier), pkce.Challenge); // the algorithm itself is pinned below
        Assert.Equal(43, pkce.Verifier.Length);
        Assert.NotEmpty(pkce.Nonce);
        Assert.NotEqual(Pkce.Create().Verifier, pkce.Verifier);
    }

    [Fact]
    public void ComputeChallenge_matches_the_rfc_7636_appendix_b_vector() =>
        Assert.Equal("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", Pkce.ComputeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"));

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
