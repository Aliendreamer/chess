using System.Text.Json;
using System.Text.Json.Serialization;

namespace Chess.Backend.WebApi.Auth;

/// <summary>What round-trips through the IdP's <c>state</c> parameter.</summary>
internal sealed record OidcState(
    [property: JsonPropertyName("n")] string Nonce,
    [property: JsonPropertyName("r")] string ReturnTo);

internal static class OidcStateCodec
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static string Encode(OidcState state)
    {
        ArgumentNullException.ThrowIfNull(state);
        return Base64Url.Encode(JsonSerializer.SerializeToUtf8Bytes(state, Json));
    }

    public static bool TryDecode(string? encoded, [NotNullWhen(true)] out OidcState? state)
    {
        state = null;
        if (!Base64Url.TryDecode(encoded, out byte[]? bytes))
        {
            return false;
        }

        try
        {
            state = JsonSerializer.Deserialize<OidcState>(bytes, Json);
        }
        catch (JsonException)
        {
            return false;
        }

        if (state is not { Nonce.Length: > 0, ReturnTo: not null })
        {
            state = null;
            return false;
        }

        return true;
    }
}
