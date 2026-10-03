using Chess.Backend.Review;
using Chess.Backend.WebApi.Games;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Reviews;

/// <summary>A game's review (game-review D6): anyone signed in may read it; a game still played has none.</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetReviewEndpoint(IReviewService reviews) : Endpoint<GameRouteRequest, ReviewView>
{
    public override void Configure()
    {
        Get("games/{id}/review");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Review")
            .Produces<ReviewView>()
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound));
    }

    public override async Task HandleAsync(GameRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        _ = GameReplyMapper.TryParseId(req.Id, out Guid id);
        if (await reviews.ReadAsync(id, ct) is not { } view)
        {
            HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
            await Send.NotFoundAsync(ct);
            return;
        }

        // A complete review never changes; one still running does every second.
        HttpContext.Response.Headers[HeaderNames.CacheControl] = view.Status == ReviewView.Complete
            ? Constants.CacheControl.ImmutablePrivate
            : Constants.CacheControl.NoStore;
        await Send.OkAsync(view, ct);
    }
}
