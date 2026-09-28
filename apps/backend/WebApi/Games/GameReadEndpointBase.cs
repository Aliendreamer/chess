using Chess.Backend.Data.ReadModels;
using Chess.Backend.Extensions;
using Microsoft.Net.Http.Headers;
using Npgsql;

namespace Chess.Backend.WebApi.Games;

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

    /// <summary>A list's page size: the request's, or <see cref="ApiOptions.DefaultPageSize"/>, clamped to <see cref="ApiOptions.MaxPageSize"/>.</summary>
    internal static int PageSize(int? requested, ApiOptions options) => Keyset.ClampLimit(requested, options.DefaultPageSize, options.MaxPageSize);
}
