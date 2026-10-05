using Chess.Backend.Trainer;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Trainer;

/// <summary>The next line of the member's study to drill (study-repertoire-trainer D10), on the trainer's schedule.</summary>
[ExcludeFromCodeCoverage]
internal sealed class NextStudyLineEndpoint(ITrainerService trainer, ICurrentUser user) : Endpoint<StudyTrainingRequest, NextStudyLineResponse>
{
    public override void Configure()
    {
        Get("trainer/studies/{id}/next");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Trainer").Produces<NextStudyLineResponse>().ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized).Produces(StatusCodes.Status404NotFound));
    }

    public override async Task HandleAsync(StudyTrainingRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        if (await trainer.StudyNextAsync(user.Id ?? 0, req.StudyId, req.Color, ct) is { } next)
        {
            await Send.OkAsync(new NextStudyLineResponse(next.Line, next.NextDueAt), ct);
            return;
        }

        await Send.NotFoundAsync(ct);
    }
}
