using Microsoft.Net.Http.Headers;
using Npgsql;

namespace Chess.Backend.WebApi.Library;

/// <summary>The opening name of one position, if it has one (game-library); the board walks back its line for the deepest.</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetOpeningEndpoint(ReadDbContext read) : Endpoint<GetOpeningRequest, OpeningView>
{
    public override void Configure()
    {
        Get("library/openings");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Library")
            .Produces<OpeningView>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(GetOpeningRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = LibraryHttp.CacheControl;
        try
        {
            if (await read.Openings.SingleOrDefaultAsync(o => o.PositionKey == req.Key, ct) is { } opening)
            {
                await Send.OkAsync(new OpeningView(opening.Eco, opening.Name), ct);
                return;
            }

            await Send.NotFoundAsync(ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }
}
