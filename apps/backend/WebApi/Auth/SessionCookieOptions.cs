namespace Chess.Backend.WebApi.Auth;

internal sealed class SessionCookieOptions
{
    public const string SectionName = "SessionCookies";

    /// <summary>Cookie <c>Domain</c>; empty means host-only.</summary>
    public string Domain { get; set; } = string.Empty;

    public string SessionName { get; set; } = Constants.Cookies.DefaultSessionName;

    public string PkceName { get; set; } = Constants.Cookies.DefaultPkceName;
}
