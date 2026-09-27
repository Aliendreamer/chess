using Chess.Backend.Projections;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Admin;

/// <summary>Replays one aggregate's parked records through its projection, in seq order.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ReplayDeadLettersEndpoint(IDeadLetterReplayer replayer) : Endpoint<ReplayDeadLettersRequest, ReplayDeadLettersResponse>
{
    public override void Configure()
    {
        Post("admin/projections/{groupId}/dead-letters/{aggregateId}/replay");
        Roles(Constants.Roles.Admin);
        Description(d => d.ClearDefaultAccepts() // route and query only: a body-less POST must not be a 415
            .WithTags("Admin")
            .Produces<ReplayDeadLettersResponse>()
            .Produces<ReplayDeadLettersResponse>(StatusCodes.Status409Conflict)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound));
    }

    public override async Task HandleAsync(ReplayDeadLettersRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = "no-store";
        ReplayResult result = await replayer.ReplayAsync(req.GroupId, req.AggregateId, ct);
        ReplayDeadLettersResponse response = new(req.GroupId, req.AggregateId, result.Status.ToString(), result.Applied, result.Error);
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
