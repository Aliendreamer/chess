using Chess.Backend.Trainer;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Trainer;

/// <summary>Records a finished run of a study line (study-repertoire-trainer D10) on the trainer's schedule.</summary>
[ExcludeFromCodeCoverage]
internal sealed class RecordStudyResultEndpoint(ITrainerService trainer, ICurrentUser user) : Endpoint<RecordStudyResultRequest, RunResult>
{
    public override void Configure()
    {
        Post("trainer/studies/{id}/results");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Trainer").Produces<RunResult>().ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized).Produces(StatusCodes.Status404NotFound));
    }

    public override async Task HandleAsync(RecordStudyResultRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        if (await trainer.RecordStudyAsync(user.Id ?? 0, req.StudyId, req.LineKey, req.Color, req.Mistakes, ct) is { } result)
        {
            await Send.OkAsync(result, ct);
            return;
        }

        await Send.NotFoundAsync(ct);
    }
}
