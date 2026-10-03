using Chess.Backend.Review;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Practice;

/// <summary>The member's practice position due now (game-review D7), or when the next one is.</summary>
[ExcludeFromCodeCoverage]
internal sealed class NextPracticeEndpoint(IPracticeService practice, ICurrentUser user) : EndpointWithoutRequest<PracticeNext>
{
    public override void Configure()
    {
        Get("practice/next");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Practice").Produces<PracticeNext>().Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        await Send.OkAsync(await practice.NextAsync(user.Id ?? 0, ct), ct);
    }
}
