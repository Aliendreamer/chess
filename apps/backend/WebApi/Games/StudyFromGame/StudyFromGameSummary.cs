namespace Chess.Backend.WebApi.Games;

internal sealed class StudyFromGameSummary : Summary<StudyFromGameEndpoint>
{
    public StudyFromGameSummary()
    {
        Summary = "Study a finished game";
        Description = "Makes a new study owned by you from a finished game's moves, titled with its players and date.";
        Responses[201] = "The new study.";
        Responses[400] = "Not a game id.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such game, or it is not finished.";
    }
}
