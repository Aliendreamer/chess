using System.Security.Cryptography;
using System.Text;

namespace Chess.Backend.WebApi.Auth;

/// <summary>The opaque cookie value: 256 random bits. Only its SHA-256 is persisted.</summary>
internal static class SessionToken
{
    private const int TokenBytes = 32;

    public static string Generate() => Base64Url.Encode(RandomNumberGenerator.GetBytes(TokenBytes));

    public static string Hash(string rawToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(rawToken);
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));
    }
}
