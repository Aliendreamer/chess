using Chess.Backend.Extensions;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Admin;

/// <summary>
/// Parked projection records, newest first. Reads the PRIMARY on purpose: an operator deciding whether to replay
/// needs to see what was parked a moment ago, and this is an admin tool, not a player-facing list.
/// </summary>
[ExcludeFromCodeCoverage]
internal sealed class ListDeadLettersEndpoint(ProjectDbContext db, IOptions<ApiOptions> options) : Endpoint<ListDeadLettersRequest, CursorPage<DeadLetterItem>>
{
    public override void Configure()
    {
        Get("admin/projections/dead-letters");
        Roles(Constants.Roles.Admin);
        Description(d => d.WithTags("Admin")
            .Produces<CursorPage<DeadLetterItem>>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden));
    }

    public override async Task HandleAsync(ListDeadLettersRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        (DateTimeOffset At, Guid Id)? after = req.Cursor is not null && KeysetCursor.TryDecodeGuid(req.Cursor, out KeysetCursor decoded, out Guid afterId)
            ? (decoded.At, afterId)
            : null;
        int limit = Keyset.ClampLimit(req.Limit, options.Value.DefaultPageSize, options.Value.MaxPageSize);
        IQueryable<ProjectionDeadLetter> query = db.ProjectionDeadLetters.AsNoTracking();
        if (!string.IsNullOrEmpty(req.GroupId))
        {
            query = query.Where(d => d.GroupId == req.GroupId);
        }

        List<DeadLetterItem> rows = await query
            .NewestFirst(d => d.ParkedAt, d => d.Id, after, limit)
            .Select(d => new DeadLetterItem(d.Id, d.GroupId, d.AggregateId, d.Seq, d.KafkaKey, d.Value, d.Attempts, d.LastError, d.FirstFailedAt, d.ParkedAt))
            .ToListAsync(ct);
        await Send.OkAsync(Keyset.ToPage(rows, limit, i => new KeysetCursor(i.ParkedAt, i.Id.ToString())), ct);
    }
}
