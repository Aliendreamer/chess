using Chess.Backend.Trainer;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Trainer;

/// <summary>The opening families (or those matching a search), with the member's learned lines (opening-trainer).</summary>
[ExcludeFromCodeCoverage]
internal sealed class ListFamiliesEndpoint(ITrainerService trainer, ICurrentUser user) : Endpoint<ListFamiliesRequest, IReadOnlyList<FamilyProgress>>
{
    public override void Configure()
    {
        Get("trainer/families");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Trainer").Produces<IReadOnlyList<FamilyProgress>>().ProducesProblemDetails().Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(ListFamiliesRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        await Send.OkAsync(await trainer.FamiliesAsync(user.Id ?? 0, req.Q, req.Color, ct), ct);
    }
}
