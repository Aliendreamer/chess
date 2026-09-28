using Chess.Backend.Data.ReadModels;
using Chess.Backend.Extensions;
using Chess.Backend.Games;
using Microsoft.Net.Http.Headers;
using Npgsql;

namespace Chess.Backend.WebApi.Games;

/// <summary>Shared cursor decoding for the game lists: a <c>uuid</c> tiebreak (D11).</summary>
internal static class GameCursor
{
    public static bool TryDecode(string? cursor, out (DateTimeOffset At, Guid Id)? after)
    {
        after = null;
        if (cursor is null)
        {
            return true;
        }

        if (!KeysetCursor.TryDecodeGuid(cursor, out KeysetCursor decoded, out Guid id))
        {
            return false;
        }

        after = (decoded.At, id);
        return true;
    }
}
