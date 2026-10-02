using Chess.Backend.Correspondence;
using Chess.Backend.Extensions;
using Chess.Backend.WebApi.Games;
using Microsoft.Net.Http.Headers;
using Npgsql;

namespace Chess.Backend.WebApi.Players;

/// <summary>Any player's games, newest first: <c>me/games</c> for someone else (player-profiles; D20).</summary>
[ExcludeFromCodeCoverage]
internal sealed class PlayerGamesEndpoint(ReadDbContext read, IOptions<ApiOptions> options, IOptions<CorrespondenceOptions> correspondence)
    : Endpoint<PlayerGamesRequest, CursorPage<MyGameItem>>
{
    public override void Configure()
    {
        Get("players/{id}/games");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Players")
            .Produces<CursorPage<MyGameItem>>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(PlayerGamesRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        GameCursor.TryDecode(req.Cursor, out (DateTimeOffset At, Guid Id)? after); // shape checked by the validator
        int limit = GameReadEndpointBase<object>.PageSize(req.Limit, options.Value);
        try
        {
            var rows = await read.RmGamePlayers
                .Where(p => p.UserId == req.Id)
                .Join(read.RmGames, p => p.GameId, g => g.GameId, (p, g) => new { P = p, G = g })
                .NewestFirst(x => x.P.CreatedAt, x => x.P.GameId, after, limit)
                .ToListAsync(ct);
            List<MyGameItem> items = rows.ConvertAll(x => GameReads.ToMyGame(x.P, x.G, correspondence.Value.MoveDeadline));
            await Send.OkAsync(Keyset.ToPage(items, limit, i => new KeysetCursor(i.CreatedAt, i.GameId.ToString())), ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }
}
