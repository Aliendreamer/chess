using Chess.Backend.Data.ReadModels;
using Npgsql;

namespace Chess.Backend.WebApi.Pings;

internal sealed record PingListItem(string PingId, long Count, string? LastText, DateTimeOffset? LastAt, long LastSeq, DateTimeOffset UpdatedAt);

internal sealed class ListPingsRequest
{
    public const int MaxLimit = 200;

    [QueryParam]
    public int Limit { get; init; } = Keyset.DefaultLimit;

    [QueryParam]
    public string? Cursor { get; init; }
}

/// <summary>Eventually consistent: served by the replica via the projection. Never touches an actor.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ListPingsEndpoint(ReadDbContext read) : Endpoint<ListPingsRequest, CursorPage<PingListItem>>
{
    public override void Configure()
    {
        Get("pings");
        Description(d => d.WithTags("Pings")
            .Produces<CursorPage<PingListItem>>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(ListPingsRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        KeysetCursor? after = null;
        if (req.Cursor is not null)
        {
            if (!KeysetCursor.TryDecode(req.Cursor, out KeysetCursor decoded))
            {
                ThrowError(r => r.Cursor, "Invalid cursor.");
            }

            after = decoded;
        }

        int limit = Keyset.ClampLimit(req.Limit, ListPingsRequest.MaxLimit);
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
