using Chess.Backend.Projections;

namespace Chess.Backend.WebApi.Admin;

internal sealed record DeadLetterItem(
    string Id,
    string GroupId,
    string AggregateId,
    long Seq,
    string KafkaKey,
    string Value,
    int Attempts,
    string LastError,
    DateTimeOffset FirstFailedAt,
    DateTimeOffset ParkedAt);

internal sealed class ListDeadLettersRequest
{
    public const int MaxLimit = 200;

    [QueryParam]
    public int Limit { get; init; } = Keyset.DefaultLimit;

    [QueryParam]
    public string? Cursor { get; init; }

    [QueryParam]
    public string? GroupId { get; init; }
}

/// <summary>
/// Parked projection records, newest first. Reads the PRIMARY on purpose: an operator deciding whether to replay
/// needs to see what was parked a moment ago, and this is an admin tool, not a player-facing list.
/// </summary>
[ExcludeFromCodeCoverage]
internal sealed class ListDeadLettersEndpoint(ProjectDbContext db) : Endpoint<ListDeadLettersRequest, CursorPage<DeadLetterItem>>
{
    public override void Configure()
    {
        Get("admin/projections/dead-letters");
        Roles(Constants.Roles.Admin);
        Description(d => d.WithTags("Admin")
            .Produces<CursorPage<DeadLetterItem>>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status403Forbidden));
    }

    public override async Task HandleAsync(ListDeadLettersRequest req, CancellationToken ct)
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

        int limit = Keyset.ClampLimit(req.Limit, ListDeadLettersRequest.MaxLimit);
        IQueryable<ProjectionDeadLetter> query = db.ProjectionDeadLetters.AsNoTracking();
        if (!string.IsNullOrEmpty(req.GroupId))
        {
            query = query.Where(d => d.GroupId == req.GroupId);
        }

        List<DeadLetterItem> rows = await query
            .NewestFirst(d => d.ParkedAt, d => d.Id, after, limit)
            .Select(d => new DeadLetterItem(d.Id, d.GroupId, d.AggregateId, d.Seq, d.KafkaKey, d.Value, d.Attempts, d.LastError, d.FirstFailedAt, d.ParkedAt))
            .ToListAsync(ct);
        await Send.OkAsync(Keyset.ToPage(rows, limit, i => new KeysetCursor(i.ParkedAt, i.Id)), ct);
    }
}

internal sealed record ReplayResponse(string GroupId, string AggregateId, string Status, int Applied, string? Error);

/// <summary>
/// Replays one aggregate's parked records through its projection, in seq order. 200 = all applied and the quarantine
/// is lifted, 409 = a record failed again (it and later ones stay parked), 404 = no projection has that group id.
/// </summary>
[ExcludeFromCodeCoverage]
internal sealed class ReplayDeadLettersEndpoint(IDeadLetterReplayer replayer) : EndpointWithoutRequest<ReplayResponse>
{
    public override void Configure()
    {
        Post("admin/projections/{groupId}/dead-letters/{aggregateId}/replay");
        Roles(Constants.Roles.Admin);
        Description(d => d.WithTags("Admin")
            .Produces<ReplayResponse>()
            .Produces<ReplayResponse>(StatusCodes.Status409Conflict)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        string groupId = Route<string>("groupId")!;
        string aggregateId = Route<string>("aggregateId")!;
        ReplayResult result = await replayer.ReplayAsync(groupId, aggregateId, ct);
        ReplayResponse response = new(groupId, aggregateId, result.Status.ToString(), result.Applied, result.Error);
        switch (result.Status)
        {
            case ReplayStatus.UnknownGroup:
                await Send.NotFoundAsync(ct);
                break;
            case ReplayStatus.Failed:
                await Send.ResponseAsync(response, StatusCodes.Status409Conflict, ct);
                break;
            default:
                await Send.OkAsync(response, ct);
                break;
        }
    }
}
