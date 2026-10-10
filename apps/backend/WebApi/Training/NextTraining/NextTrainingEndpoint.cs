using Chess.Backend.Training;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Training;

/// <summary>The next position of a training session (training D4), and how many match.</summary>
[ExcludeFromCodeCoverage]
internal sealed class NextTrainingEndpoint(ITrainingService training, ICurrentUser user) : Endpoint<NextTrainingRequest, TrainingNext>
{
    public override void Configure()
    {
        Get("training/next");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Training").Produces<TrainingNext>().ProducesProblemDetails().Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(NextTrainingRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        await Send.OkAsync(await training.NextAsync(user.Id ?? 0, req.Mode, req.Filter, req.ExcludeIds, ct), ct);
    }
}
