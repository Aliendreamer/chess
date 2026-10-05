using System.Globalization;
using Chess.Backend.Akka;
using Chess.Backend.Extensions;
using Chess.Backend.Library;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Admin;

/// <summary>Starts importing a month of lichess broadcasts into the library (broadcast-explorer D1); admins only.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ImportBroadcastsEndpoint(
    IRequiredActor<LibraryImporter> importer,
    LibraryBroadcastsOptions broadcasts,
    TimeProvider clock,
    IOptions<ApiOptions> options) : Endpoint<ImportBroadcastsRequest, ImportBroadcastsResponse>
{
    public override void Configure()
    {
        Post("admin/library/broadcasts");
        Roles(Constants.Roles.Admin);
        Description(d => d.WithTags("Admin")
            .Produces<ImportBroadcastsResponse>(StatusCodes.Status202Accepted)
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status409Conflict));
    }

    public override async Task HandleAsync(ImportBroadcastsRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        // lichess publishes a month once it is over: from FirstMonth up to last month.
        string lastPublished = clock.GetUtcNow().AddMonths(-1).ToString("yyyy-MM", CultureInfo.InvariantCulture);
        if (string.CompareOrdinal(req.Month, broadcasts.FirstMonth) < 0 || string.CompareOrdinal(req.Month, lastPublished) > 0)
        {
            ThrowError(r => r.Month, $"lichess has published {broadcasts.FirstMonth} to {lastPublished}.");
        }

        object reply = await importer.ActorRef.Ask(ActorTracing.Wrap(new StartBroadcastImport(req.Month)), options.Value.AskTimeout, ct);
        if (reply is BroadcastImportStarted started)
        {
            await Send.ResponseAsync(new ImportBroadcastsResponse(started.RunId), StatusCodes.Status202Accepted, ct);
            return;
        }

        ThrowError("A month is being imported; try again when it is done.", StatusCodes.Status409Conflict);
    }
}
