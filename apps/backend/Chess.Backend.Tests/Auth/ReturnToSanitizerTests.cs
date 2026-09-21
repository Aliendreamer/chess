namespace Chess.Backend.Tests.Auth;

public sealed class ReturnToSanitizerTests
{
    [Theory]
    [InlineData("/", "/")]
    [InlineData("/games", "/games")]
    [InlineData("/games/1?x=1&y=2#frag", "/games/1?x=1&y=2#frag")]
    public void Keeps_relative_paths(string input, string expected) =>
        Assert.Equal(expected, ReturnToSanitizer.Sanitize(input));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("games")]
    [InlineData("//evil.example")]
    [InlineData("/\\evil.example")]
    [InlineData("https://evil.example/")]
    [InlineData("/redirect?to=https://evil.example")]
    [InlineData("/has space")]
    [InlineData("/has\ttab")]
    [InlineData("/back\\slash")]
    [InlineData("javascript:alert(1)")]
    public void Falls_back_to_root_for_unsafe_input(string? input) =>
        Assert.Equal("/", ReturnToSanitizer.Sanitize(input));

    [Fact]
    public void Falls_back_when_too_long() =>
        Assert.Equal("/", ReturnToSanitizer.Sanitize("/" + new string('a', 3000)));
}
