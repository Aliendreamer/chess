using Chess.Backend.Review;
using Chess.Backend.WebApi.Games;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Reviews;

/// <summary>Asks the engine to review a finished game (game-review D2, D3): a player of the game, or an Admin.</summary>
[ExcludeFromCodeCoverage]
internal sealed class StartReviewEndpoint(IReviewService reviews, ICurrentUser user) : Endpoint<GameRouteRequest, ReviewView>
{
    public override void Configure()
    {
        Post("games/{id}/review");
        Policies(Constants.Policies.SignedIn);
        Description(d =>
        {
            d.ClearDefaultAccepts();
            d.WithTags("Review")
                .Produces<ReviewView>()
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
        bool admin = user.Roles.Contains(Constants.Roles.Admin, StringComparer.Ordinal);
        (ReviewRefusal refusal, ReviewView? view) = await reviews.StartAsync(id, user.Id ?? 0, admin, ct);
        if (view is not null)
        {
            await Send.OkAsync(view, ct);
            return;
        }

        (int status, string message) = ReviewHttp.Of(refusal);
        ThrowError(message, status);
    }
}
