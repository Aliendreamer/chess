using Chess.Backend.WebApi.Auth.Callback;

namespace Chess.Backend.Tests.Auth;

public sealed class CallbackValidatorTests
{
    private static readonly PkceValues Pkce = Chess.Backend.WebApi.Auth.Pkce.Create();

    private static string State(string nonce, string returnTo = "/games") =>
        OidcStateCodec.Encode(new OidcState(nonce, returnTo));

    [Fact]
    public void Accepts_matching_state_and_cookie()
    {
        CallbackRequest req = new() { Code = "abc", State = State(Pkce.Nonce, "/games/7") };

        CallbackOutcome outcome = CallbackValidator.Validate(req, Pkce.ToCookieValue());

        Assert.Null(outcome.Error);
        Assert.Equal("abc", outcome.Code);
        Assert.Equal(Pkce.Verifier, outcome.Verifier);
        Assert.Equal("/games/7", outcome.ReturnTo);
    }

    [Fact]
    public void Sanitizes_return_to_from_state()
    {
        CallbackRequest req = new() { Code = "abc", State = State(Pkce.Nonce, "https://evil.example") };
        CallbackOutcome outcome = CallbackValidator.Validate(req, Pkce.ToCookieValue());
        Assert.Null(outcome.Error);
        Assert.Equal("/", outcome.ReturnTo);
    }

    [Fact]
    public void Rejects_idp_error()
    {
        CallbackRequest req = new() { Error = "access_denied", Code = "abc", State = State(Pkce.Nonce) };
        Assert.Contains("access_denied", CallbackValidator.Validate(req, Pkce.ToCookieValue()).Error, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(null, "own", true)] // no code
    [InlineData("abc", "own", false)] // no PKCE cookie
    [InlineData("abc", "%%%", true)] // state that does not decode
    [InlineData("abc", "foreign", true)] // state nonce does not match the cookie's
    public void Rejects_a_callback_that_cannot_be_trusted(string? code, string state, bool withCookie)
    {
        CallbackRequest req = new()
        {
            Code = code,
            State = state switch
            {
                "own" => State(Pkce.Nonce),
                "foreign" => State("someone-elses-nonce"),
                _ => state,
            },
        };

        Assert.NotNull(CallbackValidator.Validate(req, withCookie ? Pkce.ToCookieValue() : null).Error);
    }
}
