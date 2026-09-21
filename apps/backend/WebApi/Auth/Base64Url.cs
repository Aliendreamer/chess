using System.Buffers.Text;

namespace Chess.Backend.WebApi.Auth;

internal static class Base64Url
{
    public static string Encode(ReadOnlySpan<byte> bytes) => System.Buffers.Text.Base64Url.EncodeToString(bytes);

    public static bool TryDecode(string? text, [NotNullWhen(true)] out byte[]? bytes)
    {
        bytes = null;
        if (string.IsNullOrEmpty(text))
        {
            return false;
        }

        try
        {
            bytes = System.Buffers.Text.Base64Url.DecodeFromChars(text);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
