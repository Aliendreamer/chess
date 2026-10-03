using Chess.Backend.Review;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Practice;

/// <summary>One answer to a practice position: right moves it up a box, wrong back to box 0 (the trainer's schedule).</summary>
[ExcludeFromCodeCoverage]
internal sealed class RecordPracticeEndpoint(IPracticeService practice, ICurrentUser user) : Endpoint<RecordPracticeRequest, PracticeResult>
{
    public override void Configure()
    {
        Post("practice/results");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Practice").Produces<PracticeResult>().ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized).Produces(StatusCodes.Status404NotFound));
    }

    public override async Task HandleAsync(RecordPracticeRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        if (await practice.RecordAsync(user.Id ?? 0, req.GameId, req.Ply, req.Correct, ct) is { } result)
        {
            await Send.OkAsync(result, ct);
            return;
        }

        await Send.NotFoundAsync(ct);
    }
}
