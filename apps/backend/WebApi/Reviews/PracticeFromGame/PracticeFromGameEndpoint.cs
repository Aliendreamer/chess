using Chess.Backend.Review;
using Chess.Backend.WebApi.Games;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Reviews;

/// <summary>Adds the caller's own mistakes and blunders of a reviewed game to their practice (game-review D7).</summary>
[ExcludeFromCodeCoverage]
internal sealed class PracticeFromGameEndpoint(IReviewService reviews, ICurrentUser user) : Endpoint<GameRouteRequest, PracticeFromGameResponse>
{
    public override void Configure()
    {
        Post("games/{id}/review/practice");
        Policies(Constants.Policies.SignedIn);
        Description(d =>
        {
            d.ClearDefaultAccepts();
            d.WithTags("Review")
                .Produces<PracticeFromGameResponse>()
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status409Conflict);
        });
    }

    public override async Task HandleAsync(GameRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        _ = GameReplyMapper.TryParseId(req.Id, out Guid id);
        (ReviewRefusal refusal, int added) = await reviews.AddPracticeAsync(id, user.Id ?? 0, ct);
        if (refusal == ReviewRefusal.None)
        {
            await Send.OkAsync(new PracticeFromGameResponse(added), ct);
            return;
        }

        (int status, string message) = ReviewHttp.Of(refusal);
        ThrowError(message, status);
    }
}
