using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Games;

[ExcludeFromCodeCoverage]
internal sealed class GetPgnEndpoint(ReadDbContext read) : GameReadEndpointBase<string>(read)
{
    public override void Configure()
    {
        Get("games/{id}/pgn");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Games")
            .Produces<string>(StatusCodes.Status200OK, "application/x-chess-pgn")
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(GameRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        if (await FindAsync(GameId(req), ct) is { Pgn: { } pgn })
        {
            HttpContext.Response.Headers[HeaderNames.CacheControl] = ImmutablePrivate; // only a finished game has one
            await Send.StringAsync(pgn, contentType: "application/x-chess-pgn", cancellation: ct);
            return;
        }

        await Send.NotFoundAsync(ct); // unknown, or not finished yet
    }
}
