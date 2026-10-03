namespace Chess.Backend.WebApi.Reviews;

internal sealed class StartReviewSummary : Summary<StartReviewEndpoint>
{
    public StartReviewSummary()
    {
        Summary = "Review a game with the engine";
        Description = "Sends every position of a finished game the shared cache lacks to the engine's review queue (never ahead of interactive analysis). Asking again re-sends only positions whose request was lost. A player of the game, or an Admin.";
        Responses[200] = "The review as far as it is known.";
        Responses[400] = "A malformed game id.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Not a player of the game.";
        Responses[404] = "No such game.";
        Responses[409] = "The game is still being played.";
    }
}
