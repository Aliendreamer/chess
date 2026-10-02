using Chess.Backend.Library;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Admin;

/// <summary>Imports a batch of games into the library (game-library D3); admins only.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ImportLibraryEndpoint(ILibraryService library) : Endpoint<ImportLibraryRequest, ImportLibraryResponse>
{
    public override void Configure()
    {
        Post("admin/library/import");
        Roles(Constants.Roles.Admin);
        Description(d => d.WithTags("Admin")
            .Produces<ImportLibraryResponse>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden));
    }

    public override async Task HandleAsync(ImportLibraryRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        IReadOnlyList<ImportItem> items = await library.ImportAsync(
            new ImportSource(req.Source.Trim(), req.Licence.Trim(), req.SourceRef?.Trim(), req.WorldChampionship),
            req.Games,
            ct);
        await Send.OkAsync(
            new ImportLibraryResponse(
                items.Count(i => i.Status == ImportStatus.Imported),
                items.Count(i => i.Status == ImportStatus.Duplicate),
                items.Count(i => i.Status == ImportStatus.Refused),
                items),
            ct);
    }
}
