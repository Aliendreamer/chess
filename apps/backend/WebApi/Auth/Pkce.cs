using System.Security.Cryptography;
using System.Text;

namespace Chess.Backend.WebApi.Auth;

internal sealed record PkceValues(string Verifier, string Challenge, string Nonce)
{
    public const char CookieSeparator = '.';

    /// <summary>Serialises to the PKCE cookie payload <c>"&lt;nonce&gt;.&lt;verifier&gt;"</c>.</summary>
    public string ToCookieValue() => string.Concat(Nonce, CookieSeparator, Verifier);

    public static bool TryParseCookieValue(string? value, out string nonce, out string verifier)
    {
        nonce = string.Empty;
        verifier = string.Empty;
        if (string.IsNullOrEmpty(value))
        {
            return false;
        }

        int idx = value.IndexOf(CookieSeparator, StringComparison.Ordinal);
        if (idx <= 0 || idx == value.Length - 1)
        {
            return false;
        }

        nonce = value[..idx];
        verifier = value[(idx + 1)..];
        return true;
    }
}

internal static class Pkce
{
    private const int VerifierBytes = 32;
    private const int NonceBytes = 16;

    /// <summary>RFC 7636 verifier + S256 challenge, plus a nonce that binds the state to the PKCE cookie.</summary>
    public static PkceValues Create()
    {
        string verifier = Base64Url.Encode(RandomNumberGenerator.GetBytes(VerifierBytes));
        string nonce = Base64Url.Encode(RandomNumberGenerator.GetBytes(NonceBytes));
        return new PkceValues(verifier, ComputeChallenge(verifier), nonce);
    }

    public static string ComputeChallenge(string verifier)
    {
        ArgumentException.ThrowIfNullOrEmpty(verifier);
        return Base64Url.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
    }
}
