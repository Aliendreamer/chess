namespace Chess.Backend.WebApi.Reviews;

internal sealed class PracticeFromGameSummary : Summary<PracticeFromGameEndpoint>
{
    public PracticeFromGameSummary()
    {
        Summary = "Practise my mistakes from a game";
        Description = "Adds the caller's mistakes and blunders (not inaccuracies) of a complete review to their practice, each once; due at once. A player of the game only.";
        Responses[200] = "How many positions were new.";
        Responses[400] = "A malformed game id.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Not a player of the game.";
        Responses[404] = "No such game.";
        Responses[409] = "The game is still being played, or its review is not complete.";
    }
}
