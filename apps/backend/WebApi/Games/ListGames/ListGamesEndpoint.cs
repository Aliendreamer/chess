using Chess.Backend.Data.ReadModels;
using Chess.Backend.Extensions;
using Npgsql;

namespace Chess.Backend.WebApi.Games;

/// <summary>Games being played (most recent activity first) or ended (most recently ended first). Eventually consistent: replica.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ListGamesEndpoint(ReadDbContext read, IOptions<ApiOptions> options) : Endpoint<ListGamesRequest, CursorPage<GameListItem>>
{
    public override void Configure()
    {
        Get("games");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Games")
            .Produces<CursorPage<GameListItem>>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(ListGamesRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        GameCursor.TryDecode(req.Cursor, out (DateTimeOffset At, Guid Id)? after); // shape checked by the validator
        int limit = GameReadEndpointBase<object>.PageSize(req.Limit, options.Value);
        try
        {
            List<RmGame> rows = await read.RmGames
                .Where(g => g.Status == req.Status)
                .NewestFirst(g => g.UpdatedAt, g => g.GameId, after, limit)
                .ToListAsync(ct);
            await Send.OkAsync(Keyset.ToPage(rows.ConvertAll(GameReads.ToListItem), limit, i => new KeysetCursor(i.UpdatedAt, i.GameId.ToString())), ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }
}
