using Chess.Backend.Extensions;
using Npgsql;

namespace Chess.Backend.WebApi.Games;

/// <summary>The signed-in user's games as either colour, newest first. Eventually consistent: replica.</summary>
[ExcludeFromCodeCoverage]
internal sealed class MyGamesEndpoint(ReadDbContext read, ICurrentUser user, IOptions<ApiOptions> options) : Endpoint<MyGamesRequest, CursorPage<MyGameItem>>
{
    public override void Configure()
    {
        Get("me/games");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Games")
            .Produces<CursorPage<MyGameItem>>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(MyGamesRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        GameCursor.TryDecode(req.Cursor, out (DateTimeOffset At, Guid Id)? after); // shape checked by the validator
        long me = user.Id ?? 0;
        int limit = GameReadEndpointBase<object>.PageSize(req.Limit, options.Value);
        try
        {
            // One seek on (UserId, CreatedAt, GameId); status and result come from the game's own row (the only place they change).
            var rows = await read.RmGamePlayers
                .Where(p => p.UserId == me)
                .Join(read.RmGames, p => p.GameId, g => g.GameId, (p, g) => new { P = p, G = g })
                .NewestFirst(x => x.P.CreatedAt, x => x.P.GameId, after, limit)
                .ToListAsync(ct);
            List<MyGameItem> items = rows.ConvertAll(x => GameReads.ToMyGame(x.P, x.G));
            await Send.OkAsync(Keyset.ToPage(items, limit, i => new KeysetCursor(i.CreatedAt, i.GameId.ToString())), ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }
}
