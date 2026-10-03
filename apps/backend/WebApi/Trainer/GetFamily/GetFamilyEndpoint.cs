using Chess.Backend.Trainer;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Trainer;

/// <summary>A family's lines with the member's state for one side (opening-trainer).</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetFamilyEndpoint(ITrainerService trainer, ICurrentUser user) : Endpoint<FamilyRequest, IReadOnlyList<LineProgress>>
{
    public override void Configure()
    {
        Get("trainer/family");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Trainer").Produces<IReadOnlyList<LineProgress>>().ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized).Produces(StatusCodes.Status404NotFound));
    }

    public override async Task HandleAsync(FamilyRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        if (await trainer.FamilyAsync(user.Id ?? 0, req.Name, req.Color, ct) is { } lines)
        {
            await Send.OkAsync(lines, ct);
            return;
        }

        await Send.NotFoundAsync(ct);
    }
}
