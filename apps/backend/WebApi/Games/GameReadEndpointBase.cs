using Chess.Backend.Akka.Games;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Extensions;
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

/// <summary>Read-model rows → API shapes (game-history). Pure, so the endpoints stay thin and this is what's tested.</summary>
internal static class GameReads
{
    public static bool IsListStatus(string? status) => status is RmGame.Playing or RmGame.Ended;

    public static GameListItem ToListItem(RmGame g) => new(
        g.GameId, g.WhiteId, g.WhiteName, g.BlackId, g.BlackName, g.TimeControl, g.Status, g.Result, g.Reason, g.Ply, g.CreatedAt, g.UpdatedAt);

    public static MyGameItem ToMyGame(RmGamePlayer me, RmGame g) => new(
        g.GameId, me.Color, me.OpponentId, me.OpponentName, g.TimeControl, g.Status, g.Result, g.Reason, me.CreatedAt);

    public static GameSummary ToSummary(RmGame g) => new(
        g.GameId, g.WhiteId, g.WhiteName, g.BlackId, g.BlackName, g.TimeControl, g.Status, g.Result, g.Reason, g.Ply, g.LastFen,
        g.CreatedAt, g.EndedAt, g.Pgn is not null);

    public static MoveItem ToMove(RmMove m) => new(m.Ply, m.Uci, m.San, m.FenAfter, m.WhiteMs, m.BlackMs, m.At);

    /// <summary>An ended game's live view straight from its row, the same shape the actor answers with (D5).</summary>
    public static GameView ToView(RmGame g) => new(
        g.GameId, g.WhiteId, g.BlackId, g.TimeControl, GameStatus.Ended, g.LastFen, g.Ply, g.Ply % 2 == 0 ? "White" : "Black",
        g.LastUci, g.LastSan, g.WhiteMs, g.BlackMs, g.EndedAt ?? g.UpdatedAt, null, g.Result, g.Reason, g.LastSeq);
}

/// <summary>
/// Shared plumbing for the replica reads of one game: id parsing, the 404, the 503 when the replica is down, and the
/// cache headers (a finished game never changes, so its reads may be kept by the browser; a live one may not).
/// </summary>
[ExcludeFromCodeCoverage]
internal abstract class GameReadEndpointBase<TResponse>(ReadDbContext read) : Endpoint<GameRouteRequest, TResponse>
{
    /// <summary>A finished game's reads are immutable: the browser (never a shared cache) may keep them for a day.</summary>
    protected const string ImmutablePrivate = "private, max-age=86400, immutable";

    protected ReadDbContext Read { get; } = read;

    protected Guid GameId(GameRouteRequest req)
    {
        if (!GameReplyMapper.TryParseId(req.Id, out Guid id))
        {
            ThrowError("Game id must be a lower-case Guid, with or without dashes.", StatusCodes.Status400BadRequest);
        }

        return id;
    }

    protected async Task<RmGame?> FindAsync(Guid id, CancellationToken ct)
    {
        try
        {
            return await Read.RmGames.SingleOrDefaultAsync(g => g.GameId == id, ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
            return null;
        }
    }

    protected void CacheFor(RmGame game) =>
        HttpContext.Response.Headers[HeaderNames.CacheControl] = game.Status == RmGame.Ended ? ImmutablePrivate : "no-store";

    protected void Standard(string route)
    {
        Get(route);
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Games")
            .Produces<TResponse>()
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    /// <summary>A list's page size: the request's, clamped to <see cref="ApiOptions.MaxPageSize"/>.</summary>
    internal static int PageSize(int requested, ApiOptions options) => Keyset.ClampLimit(requested, options.MaxPageSize);
}
