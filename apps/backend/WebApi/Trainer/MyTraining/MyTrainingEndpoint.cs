using Chess.Backend.Trainer;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Trainer;

/// <summary>The families the member has trained, per side, with their learned lines (the member's own profile).</summary>
[ExcludeFromCodeCoverage]
internal sealed class MyTrainingEndpoint(ITrainerService trainer, ICurrentUser user) : EndpointWithoutRequest<IReadOnlyList<TrainedFamily>>
{
    public override void Configure()
    {
        Get("me/trainer");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Trainer").Produces<IReadOnlyList<TrainedFamily>>().Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        await Send.OkAsync(await trainer.MineAsync(user.Id ?? 0, ct), ct);
    }
}
