namespace Chess.Backend.WebApi.Auth;

/// <summary>
/// Keeps <c>returnTo</c> a relative in-app path so the callback can never become an open redirect.
/// </summary>
internal static class ReturnToSanitizer
{
    public const string Default = "/";
    private const int MaxLength = 2048;

    public static string Sanitize(string? returnTo)
    {
        if (string.IsNullOrWhiteSpace(returnTo) || returnTo.Length > MaxLength)
        {
            return Default;
        }

        // Must be an absolute-path reference: exactly one leading '/', no scheme, no authority.
        if (returnTo[0] != '/' || (returnTo.Length > 1 && (returnTo[1] == '/' || returnTo[1] == '\\')))
        {
            return Default;
        }

        if (returnTo.Contains("://", StringComparison.Ordinal) || returnTo.Contains('\\', StringComparison.Ordinal))
        {
            return Default;
        }

        foreach (char c in returnTo)
        {
            if (char.IsControl(c) || char.IsWhiteSpace(c))
            {
                return Default;
            }
        }

        return returnTo;
    }
}
