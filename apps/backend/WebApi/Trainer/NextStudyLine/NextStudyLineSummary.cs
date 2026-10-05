namespace Chess.Backend.WebApi.Trainer;

internal sealed class NextStudyLineSummary : Summary<NextStudyLineEndpoint>
{
    public NextStudyLineSummary()
    {
        Summary = "The next line of my study to drill";
        Description = "As for the named openings: the due line with the lowest box, then the oldest due, then a line never trained (in tree order); when none is due, line is null and nextDueAt says when.";
        Responses[200] = "The line to drill, or none with when the next is due.";
        Responses[400] = "A malformed id or colour.";
        Responses[401] = "Not signed in.";
        Responses[404] = "Not one of the member's studies.";
    }
}
