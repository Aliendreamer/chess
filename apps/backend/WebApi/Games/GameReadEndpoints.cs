using Chess.Backend.Data.ReadModels;
using Chess.Backend.WebApi.Authentication;
using Npgsql;

namespace Chess.Backend.WebApi.Games;

internal sealed class ListGamesRequest
{
    public const int MaxLimit = 200;

    [QueryParam]
    public string? Status { get; init; }

    [QueryParam]
    public int Limit { get; init; } = Keyset.DefaultLimit;

    [QueryParam]
    public string? Cursor { get; init; }
}

internal sealed class MyGamesRequest
{
    [QueryParam]
    public int Limit { get; init; } = Keyset.DefaultLimit;

    [QueryParam]
    public string? Cursor { get; init; }
}

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

/// <summary>Games being played (most recent activity first) or ended (most recently ended first). Eventually consistent: replica.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ListGamesEndpoint(ReadDbContext read) : Endpoint<ListGamesRequest, CursorPage<GameListItem>>
{
    public override void Configure()
    {
        Get("games");
        Description(d => d.WithTags("Games")
            .WithSummary("Games being played or ended, newest activity first. Eventually consistent (replica).")
            .Produces<CursorPage<GameListItem>>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(ListGamesRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        if (!GameReads.IsListStatus(req.Status))
        {
            ThrowError(r => r.Status, "status must be 'playing' or 'ended'.");
        }

        if (!GameCursor.TryDecode(req.Cursor, out (DateTimeOffset At, Guid Id)? after))
        {
            ThrowError(r => r.Cursor, "Invalid cursor.");
        }

        int limit = Keyset.ClampLimit(req.Limit, ListGamesRequest.MaxLimit);
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

/// <summary>The signed-in user's games as either colour, newest first. Eventually consistent: replica.</summary>
[ExcludeFromCodeCoverage]
internal sealed class MyGamesEndpoint(ReadDbContext read, ICurrentUser user) : Endpoint<MyGamesRequest, CursorPage<MyGameItem>>
{
    public override void Configure()
    {
        Get("me/games");
        Description(d => d.WithTags("Games")
            .WithSummary("My games, newest first. Eventually consistent (replica).")
            .Produces<CursorPage<MyGameItem>>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(MyGamesRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        if (!GameCursor.TryDecode(req.Cursor, out (DateTimeOffset At, Guid Id)? after))
        {
            ThrowError(r => r.Cursor, "Invalid cursor.");
        }

        long me = user.Id ?? 0;
        int limit = Keyset.ClampLimit(req.Limit, ListGamesRequest.MaxLimit);
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

/// <summary>Shared id parsing, 404 and 503 handling for the single-game reads.</summary>
[ExcludeFromCodeCoverage]
internal abstract class GameReadEndpointBase<TResponse>(ReadDbContext read) : EndpointWithoutRequest<TResponse>
{
    protected ReadDbContext Read { get; } = read;

    protected Guid GameId()
    {
        if (!GameReplyMapper.TryParseId(Route<string>("id"), out Guid id))
        {
            ThrowError("Game id must be 32 lower-case hex digits.", StatusCodes.Status400BadRequest);
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
}

[ExcludeFromCodeCoverage]
internal sealed class GameSummaryEndpoint(ReadDbContext read) : GameReadEndpointBase<GameSummary>(read)
{
    public override void Configure()
    {
        Get("games/{id}");
        Description(d => d.WithTags("Games").WithSummary("A game's summary. Eventually consistent (replica).")
            .Produces<GameSummary>().Produces(StatusCodes.Status404NotFound).Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        if (await FindAsync(GameId(), ct) is { } game)
        {
            await Send.OkAsync(GameReads.ToSummary(game), ct);
            return;
        }

        await Send.NotFoundAsync(ct);
    }
}

[ExcludeFromCodeCoverage]
internal sealed class GameMovesEndpoint(ReadDbContext read) : GameReadEndpointBase<IReadOnlyList<MoveItem>>(read)
{
    public override void Configure()
    {
        Get("games/{id}/moves");
        Description(d => d.WithTags("Games").WithSummary("Every move in ply order, with clocks. Eventually consistent (replica).")
            .Produces<IReadOnlyList<MoveItem>>().Produces(StatusCodes.Status404NotFound).Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        Guid id = GameId();
        if (await FindAsync(id, ct) is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        List<RmMove> moves = await Read.RmMoves.Where(m => m.GameId == id).OrderBy(m => m.Ply).ToListAsync(ct);
        await Send.OkAsync(moves.ConvertAll(GameReads.ToMove), ct);
    }
}

[ExcludeFromCodeCoverage]
internal sealed class GamePgnEndpoint(ReadDbContext read) : GameReadEndpointBase<string>(read)
{
    public override void Configure()
    {
        Get("games/{id}/pgn");
        Description(d => d.WithTags("Games").WithSummary("A finished game's PGN (D22).")
            .Produces<string>(StatusCodes.Status200OK, "application/x-chess-pgn")
            .Produces(StatusCodes.Status404NotFound).Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        if (await FindAsync(GameId(), ct) is { Pgn: { } pgn })
        {
            await Send.StringAsync(pgn, contentType: "application/x-chess-pgn", cancellation: ct);
            return;
        }

        await Send.NotFoundAsync(ct); // unknown, or not finished yet
    }
}
