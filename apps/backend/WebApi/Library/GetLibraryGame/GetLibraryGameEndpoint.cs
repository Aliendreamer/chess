using Microsoft.Net.Http.Headers;
using Npgsql;

namespace Chess.Backend.WebApi.Library;

/// <summary>One library game with its moves (game-library).</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetLibraryGameEndpoint(ReadDbContext read) : Endpoint<GetLibraryGameRequest, LibraryGameView>
{
    public override void Configure()
    {
        Get("library/games/{id}");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Library")
            .Produces<LibraryGameView>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(GetLibraryGameRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        try
        {
            if (await read.LibraryGames.SingleOrDefaultAsync(g => g.Id == req.Id, ct) is not { } game)
            {
                await Send.NotFoundAsync(ct);
                return;
            }

            HttpContext.Response.Headers[HeaderNames.CacheControl] = LibraryHttp.CacheControl;
            await Send.OkAsync(new LibraryGameView(LibraryHttp.ToItem(game), game.MovesUci, game.SourceRef), ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }
}
