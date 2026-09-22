using Chess.Backend.Data.ReadModels;
using Npgsql;

namespace Chess.Backend.WebApi.Pings;

internal sealed record PingListItem(string PingId, long Count, string? LastText, DateTimeOffset? LastAt, long LastSeq);

internal sealed record PingListResponse(IReadOnlyList<PingListItem> Items, int Page, int PageSize);

internal sealed class ListPingsRequest
{
    [QueryParam]
    public int Page { get; init; } = 1;

    [QueryParam]
    public int PageSize { get; init; } = 50;
}

/// <summary>Eventually consistent: served by the replica via the projection. Never touches an actor.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ListPingsEndpoint(ReadDbContext read) : Endpoint<ListPingsRequest, PingListResponse>
{
    public override void Configure()
    {
        Get("pings");
        Description(d => d.WithTags("Pings").Produces<PingListResponse>().Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(ListPingsRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        (int skip, int take) = PingPaging.Page(req.Page, req.PageSize);
        try
        {
            List<PingListItem> items = await read.RmPings
                .OrderByDescending(p => p.UpdatedAt)
                .Skip(skip).Take(take)
                .Select(p => new PingListItem(p.PingId, p.Count, p.LastText, p.LastAt, p.LastSeq))
                .ToListAsync(ct);
            await Send.OkAsync(new PingListResponse(items, Math.Max(req.Page, 1), take), ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }
}

internal static class PingPaging
{
    public static (int Skip, int Take) Page(int page, int pageSize)
    {
        int size = Math.Clamp(pageSize <= 0 ? 50 : pageSize, 1, 200);
        int number = Math.Max(page, 1);
        return ((number - 1) * size, size);
    }
}
