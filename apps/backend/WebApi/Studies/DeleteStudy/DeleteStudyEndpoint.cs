using Chess.Backend.Studies;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Studies;

/// <summary>Deletes a study you own.</summary>
[ExcludeFromCodeCoverage]
internal sealed class DeleteStudyEndpoint(IStudyService studies, ICurrentUser user) : Endpoint<StudyRouteRequest>
{
    public override void Configure()
    {
        Delete("studies/{id}");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Studies")
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound));
    }

    public override async Task HandleAsync(StudyRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        _ = Chess.Backend.WebApi.Games.GameReplyMapper.TryParseId(req.Id, out Guid id);
        if (await studies.DeleteAsync(id, user.Id ?? 0, ct))
        {
            await Send.NoContentAsync(ct);
            return;
        }

        await Send.NotFoundAsync(ct);
    }
}
