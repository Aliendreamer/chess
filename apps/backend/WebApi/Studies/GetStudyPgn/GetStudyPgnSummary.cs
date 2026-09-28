namespace Chess.Backend.WebApi.Studies;

internal sealed class GetStudyPgnSummary : Summary<GetStudyPgnEndpoint>
{
    public GetStudyPgnSummary()
    {
        Summary = "A study as PGN";
        Description = "The study as PGN, with each variation in parentheses after the move it replaces.";
        Responses[200] = "The PGN text.";
        Responses[400] = "Not a study id.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such study, or a private one that is not yours.";
    }
}
