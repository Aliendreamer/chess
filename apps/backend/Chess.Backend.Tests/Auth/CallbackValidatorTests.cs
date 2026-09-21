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

    [Fact]
    public void Rejects_missing_code()
    {
        CallbackRequest req = new() { State = State(Pkce.Nonce) };
        Assert.NotNull(CallbackValidator.Validate(req, Pkce.ToCookieValue()).Error);
    }

    [Fact]
    public void Rejects_missing_pkce_cookie()
    {
        CallbackRequest req = new() { Code = "abc", State = State(Pkce.Nonce) };
        Assert.NotNull(CallbackValidator.Validate(req, null).Error);
    }

    [Fact]
    public void Rejects_malformed_state()
    {
        CallbackRequest req = new() { Code = "abc", State = "%%%" };
        Assert.NotNull(CallbackValidator.Validate(req, Pkce.ToCookieValue()).Error);
    }

    [Fact]
    public void Rejects_nonce_mismatch_between_state_and_cookie()
    {
        CallbackRequest req = new() { Code = "abc", State = State("someone-elses-nonce") };
        Assert.NotNull(CallbackValidator.Validate(req, Pkce.ToCookieValue()).Error);
    }
}
