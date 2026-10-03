namespace Chess.Backend.WebApi.Trainer;

internal sealed class NextLineSummary : Summary<NextLineEndpoint>
{
    public NextLineSummary()
    {
        Summary = "The next line to drill";
        Description = "The due line with the lowest box, then the oldest due, then a line never trained; when none is due, line is null and nextDueAt says when the next one is.";
        Responses[200] = "The line to drill, or none with when the next is due.";
        Responses[400] = "A malformed name or colour.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such family or variation.";
    }
}
