using Chess.Backend.Training;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Training;

/// <summary>Judges one answer (training D4) and moves the position in the member's Leitner boxes.</summary>
[ExcludeFromCodeCoverage]
internal sealed class AnswerTrainingEndpoint(ITrainingService training, ICurrentUser user) : Endpoint<AnswerTrainingRequest, TrainingVerdict>
{
    public override void Configure()
    {
        Post("training/answer");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Training").Produces<TrainingVerdict>().ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized).Produces(StatusCodes.Status404NotFound));
    }

    public override async Task HandleAsync(AnswerTrainingRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        if (await training.AnswerAsync(user.Id ?? 0, req.Mode, req.Id, req.Uci, ct) is { } verdict)
        {
            await Send.OkAsync(verdict, ct);
            return;
        }

        await Send.NotFoundAsync(ct);
    }
}
