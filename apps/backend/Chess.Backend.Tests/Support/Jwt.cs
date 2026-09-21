using System.Text;
using System.Text.Json;

namespace Chess.Backend.Tests.Support;

internal static class Jwt
{
    /// <summary>An unsigned JWT with the given payload; enough for pure readers, never for validation.</summary>
    public static string Unsigned(object payload)
    {
        string header = Base64Url.Encode(Encoding.UTF8.GetBytes("""{"alg":"none","typ":"JWT"}"""));
        string body = Base64Url.Encode(JsonSerializer.SerializeToUtf8Bytes(payload));
        return $"{header}.{body}.";
    }
}
