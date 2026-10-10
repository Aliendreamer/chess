namespace Chess.Backend.WebApi.Training;

internal sealed class AnswerTrainingSummary : Summary<AnswerTrainingEndpoint>
{
    public AnswerTrainingSummary()
    {
        Summary = "Answer a training position";
        Description = "library: right when the move is the master's (verdict master), one the engine accepts (engine) or both (both). games: right when the engine accepts it; playedUci is the move played in the game. A right answer moves the position up one box (due after 1, 3, 7, 14 or 30 days), a wrong one back to box 0, due at once; learned from box 3. The answer always carries the master's move (library), the accepted moves, the engine's line and where the position came from. 404 for a position not in the caller's pool.";
        Responses[200] = "The verdict and the position's new box.";
        Responses[400] = "A malformed mode, id or move.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such position for the caller.";
    }
}
