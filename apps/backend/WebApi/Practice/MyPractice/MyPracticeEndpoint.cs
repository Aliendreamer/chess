using Chess.Backend.Review;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Practice;

/// <summary>The member's practice in numbers: positions, learned, due now (the nav count and the profile line).</summary>
[ExcludeFromCodeCoverage]
internal sealed class MyPracticeEndpoint(IPracticeService practice, ICurrentUser user) : EndpointWithoutRequest<PracticeSummary>
{
    public override void Configure()
    {
        Get("me/practice");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Practice").Produces<PracticeSummary>().Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        await Send.OkAsync(await practice.MineAsync(user.Id ?? 0, ct), ct);
    }
}
