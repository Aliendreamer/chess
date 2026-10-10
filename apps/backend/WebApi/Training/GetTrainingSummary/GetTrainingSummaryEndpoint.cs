using Chess.Backend.Training;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Training;

/// <summary>The member's training in numbers (training D4): the profile panel and the start panel.</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetTrainingSummaryEndpoint(ITrainingService training, ICurrentUser user) : EndpointWithoutRequest<TrainingSummary>
{
    public override void Configure()
    {
        Get("training/summary");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Training").Produces<TrainingSummary>().Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        await Send.OkAsync(await training.SummaryAsync(user.Id ?? 0, ct), ct);
    }
}
