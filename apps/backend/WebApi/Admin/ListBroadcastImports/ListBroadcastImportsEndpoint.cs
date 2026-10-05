using Chess.Backend.Library;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Admin;

/// <summary>The latest broadcast imports with their counts (broadcast-explorer D1), from the primary: they change while running.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ListBroadcastImportsEndpoint(IBroadcastImports imports) : EndpointWithoutRequest<IReadOnlyList<BroadcastImportRunView>>
{
    /// <summary>A status list, not a history: the latest runs only.</summary>
    public const int Shown = 20;

    public override void Configure()
    {
        Get("admin/library/broadcasts");
        Roles(Constants.Roles.Admin);
        Description(d => d.WithTags("Admin")
            .Produces<IReadOnlyList<BroadcastImportRunView>>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        IReadOnlyList<LibraryImportRun> runs = await imports.RecentAsync(Shown, ct);
        await Send.OkAsync(
            [.. runs.Select(r => new BroadcastImportRunView(r.Id, r.Month, r.State, r.Read, r.Kept, r.Imported, r.Duplicate, r.Refused, r.Error, r.StartedAt, r.FinishedAt))],
            ct);
    }
}
