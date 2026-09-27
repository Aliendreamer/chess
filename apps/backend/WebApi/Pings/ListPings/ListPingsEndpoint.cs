using Chess.Backend.Extensions;
using Npgsql;

namespace Chess.Backend.WebApi.Pings;

/// <summary>Eventually consistent: served by the replica via the projection. Never touches an actor.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ListPingsEndpoint(ReadDbContext read, IOptions<ApiOptions> options) : Endpoint<ListPingsRequest, CursorPage<PingListItem>>
{
    public override void Configure()
    {
        Get("pings");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Pings")
            .Produces<CursorPage<PingListItem>>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(ListPingsRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        KeysetCursor? after = req.Cursor is not null && KeysetCursor.TryDecode(req.Cursor, out KeysetCursor decoded) ? decoded : null;
        int limit = Keyset.ClampLimit(req.Limit, options.Value.DefaultPageSize, options.Value.MaxPageSize);
        try
        {
            List<PingListItem> rows = await read.RmPings
                .NewestFirst(p => p.UpdatedAt, p => p.PingId, after, limit)
                .Select(p => new PingListItem(p.PingId, p.Count, p.LastText, p.LastAt, p.LastSeq, p.UpdatedAt))
                .ToListAsync(ct);
            await Send.OkAsync(Keyset.ToPage(rows, limit, i => new KeysetCursor(i.UpdatedAt, i.PingId)), ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }
}
