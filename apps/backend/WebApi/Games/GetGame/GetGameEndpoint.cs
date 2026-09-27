namespace Chess.Backend.WebApi.Games;

[ExcludeFromCodeCoverage]
internal sealed class GetGameEndpoint(ReadDbContext read) : GameReadEndpointBase<GameSummary>(read)
{
    public override void Configure() => Standard("games/{id}");

    public override async Task HandleAsync(GameRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        if (await FindAsync(GameId(req), ct) is { } game)
        {
            CacheFor(game);
            await Send.OkAsync(GameReads.ToSummary(game), ct);
            return;
        }

        await Send.NotFoundAsync(ct);
    }
}
