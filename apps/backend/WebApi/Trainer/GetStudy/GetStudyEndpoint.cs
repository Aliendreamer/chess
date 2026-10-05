using Chess.Backend.Trainer;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Trainer;

/// <summary>One of the member's studies as lines to drill, with the member's state per line (study-repertoire-trainer D10).</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetStudyEndpoint(ITrainerService trainer, ICurrentUser user) : Endpoint<StudyTrainingRequest, StudyDrill>
{
    public override void Configure()
    {
        Get("trainer/studies/{id}");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Trainer").Produces<StudyDrill>().ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized).Produces(StatusCodes.Status404NotFound));
    }

    public override async Task HandleAsync(StudyTrainingRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        if (await trainer.StudyAsync(user.Id ?? 0, req.StudyId, req.Color, ct) is { } drill)
        {
            await Send.OkAsync(drill, ct);
            return;
        }

        await Send.NotFoundAsync(ct);
    }
}
