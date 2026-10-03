using Chess.Backend.Trainer;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Trainer;

/// <summary>The next line of a family for the member and side (opening-trainer D4).</summary>
[ExcludeFromCodeCoverage]
internal sealed class NextLineEndpoint(ITrainerService trainer, ICurrentUser user) : Endpoint<FamilyRequest, NextLineResponse>
{
    public override void Configure()
    {
        Get("trainer/next");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Trainer").Produces<NextLineResponse>().ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized).Produces(StatusCodes.Status404NotFound));
    }

    public override async Task HandleAsync(FamilyRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        if (await trainer.NextAsync(user.Id ?? 0, req.Name, req.Color, ct) is { } next)
        {
            await Send.OkAsync(new NextLineResponse(next.Line, next.NextDueAt), ct);
            return;
        }

        await Send.NotFoundAsync(ct);
    }
}
