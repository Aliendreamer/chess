using System.Text.Json;

namespace Chess.Backend.WebApi.Auth;

/// <summary>
/// Reads <c>sub</c> straight from a JWT payload, without validation — the token was just issued to us by the IdP
/// over the back channel, and JwtBearer validates it on every subsequent request anyway.
/// </summary>
internal static class JwtSubjectReader
{
    public static bool TryReadSubject(string? jwt, [NotNullWhen(true)] out string? subject)
    {
        subject = null;
        if (string.IsNullOrEmpty(jwt))
        {
            return false;
        }

        string[] parts = jwt.Split('.');
        if (parts.Length < 2 || !Base64Url.TryDecode(parts[1], out byte[]? payload))
        {
            return false;
        }

        try
        {
            using JsonDocument doc = JsonDocument.Parse(payload);
            if (doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty(Constants.Claims.Subject, out JsonElement sub)
                && sub.ValueKind == JsonValueKind.String)
            {
                subject = sub.GetString();
                return !string.IsNullOrEmpty(subject);
            }
        }
        catch (JsonException)
        {
            return false;
        }

        return false;
    }
}
