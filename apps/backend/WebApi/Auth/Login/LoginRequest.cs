namespace Chess.Backend.WebApi.Auth;

internal sealed class LoginRequest
{
    /// <summary>Where to land after login: a relative app path; anything else becomes <c>/</c> (<c>ReturnToSanitizer</c>).</summary>
    [QueryParam]
    public string? ReturnTo { get; init; }
}
