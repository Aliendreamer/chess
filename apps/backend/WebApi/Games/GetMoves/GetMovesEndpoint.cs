using Chess.Backend.Data.ReadModels;

namespace Chess.Backend.WebApi.Games;

[ExcludeFromCodeCoverage]
internal sealed class GetMovesEndpoint(ReadDbContext read) : GameReadEndpointBase<IReadOnlyList<MoveItem>>(read)
{
    public override void Configure() => Standard("games/{id}/moves");

    public override async Task HandleAsync(GameRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        Guid id = GameId(req);
        if (await FindAsync(id, ct) is not { } game)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        List<RmMove> moves = await Read.RmMoves.Where(m => m.GameId == id).OrderBy(m => m.Ply).ToListAsync(ct);
        CacheFor(game);
        await Send.OkAsync(moves.ConvertAll(GameReads.ToMove), ct);
    }
}
