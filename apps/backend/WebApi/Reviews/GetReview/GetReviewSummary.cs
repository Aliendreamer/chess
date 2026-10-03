namespace Chess.Backend.WebApi.Reviews;

internal sealed class GetReviewSummary : Summary<GetReviewEndpoint>
{
    public GetReviewSummary()
    {
        Summary = "A game's engine review";
        Description = "Status none, running or complete; positions evaluated of the game's positions; each move with the score after it (from White's side, and as winning chances −1…1), the engine's better move and line, and its class (none, inaccuracy, mistake, blunder; null until both positions are evaluated); marks per player; where the game left the named openings. A game still being played has none.";
        Responses[200] = "The review.";
        Responses[400] = "A malformed game id.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such game.";
    }
}
