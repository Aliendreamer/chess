using Chess.Backend.Extensions;
using Chess.Backend.Library;
using Chess.Backend.WebApi.Games;
using Microsoft.Net.Http.Headers;
using Npgsql;

namespace Chess.Backend.WebApi.Library;

/// <summary>Searches the library by players, event, years, result, World Championship, ECO and opening (game-library).</summary>
[ExcludeFromCodeCoverage]
internal sealed class SearchLibraryEndpoint(ReadDbContext read, IOptions<ApiOptions> options) : Endpoint<SearchLibraryRequest, CursorPage<LibraryGameItem>>
{
    public override void Configure()
    {
        Get("library/games");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Library")
            .Produces<CursorPage<LibraryGameItem>>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(SearchLibraryRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = LibraryHttp.CacheControl;
        LibraryCursor.TryDecode(req.Cursor, out LibraryCursor? after); // shape checked by the validator
        int limit = GameReadEndpointBase<object>.PageSize(req.Limit, options.Value);
        try
        {
            List<LibraryGame> rows = await LibraryReads.Filter(read.LibraryGames, req.ToSearch()).NewestYearFirst(after, limit).ToListAsync(ct);
            List<LibraryGameItem> items = [.. rows.Take(limit).Select(LibraryHttp.ToItem)];
            string? next = rows.Count > limit ? LibraryCursor.After(rows[limit - 1]).Encode() : null;
            await Send.OkAsync(new CursorPage<LibraryGameItem>(items, next, limit), ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }
}
