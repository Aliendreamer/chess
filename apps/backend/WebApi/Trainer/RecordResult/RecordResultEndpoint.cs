using Chess.Backend.Trainer;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Trainer;

/// <summary>Records a finished run of a line (opening-trainer D4): clean moves it up a box, a mistake back to box 0.</summary>
[ExcludeFromCodeCoverage]
internal sealed class RecordResultEndpoint(ITrainerService trainer, ICurrentUser user) : Endpoint<RecordResultRequest, RunResult>
{
    public override void Configure()
    {
        Post("trainer/results");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Trainer").Produces<RunResult>().ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized).Produces(StatusCodes.Status404NotFound));
    }

    public override async Task HandleAsync(RecordResultRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        if (await trainer.RecordAsync(user.Id ?? 0, req.LineKey, req.Color, req.Mistakes, ct) is { } result)
        {
            await Send.OkAsync(result, ct);
            return;
        }

        await Send.NotFoundAsync(ct);
    }
}
