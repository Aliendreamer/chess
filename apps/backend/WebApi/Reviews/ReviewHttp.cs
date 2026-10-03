using Chess.Backend.Review;

namespace Chess.Backend.WebApi.Reviews;

/// <summary>What a refused review request answers (game-review D3).</summary>
internal static class ReviewHttp
{
    public static (int Status, string Message) Of(ReviewRefusal refusal) => refusal switch
    {
        ReviewRefusal.NotFound => (StatusCodes.Status404NotFound, "No such game."),
        ReviewRefusal.InPlay => (StatusCodes.Status409Conflict, "The game is still being played: it can be reviewed once it ends."),
        ReviewRefusal.NotPlayer => (StatusCodes.Status403Forbidden, "Only the game's players can do that."),
        ReviewRefusal.NotComplete => (StatusCodes.Status409Conflict, "The review is not complete yet."),
        _ => (StatusCodes.Status400BadRequest, "Refused."),
    };
}
