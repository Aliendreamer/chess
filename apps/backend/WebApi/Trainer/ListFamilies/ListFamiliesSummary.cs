namespace Chess.Backend.WebApi.Trainer;

internal sealed class ListFamiliesSummary : Summary<ListFamiliesEndpoint>
{
    public ListFamiliesSummary()
    {
        Summary = "Opening families to train";
        Description = "Every family of the named openings (the name before ':'), or the families and variations whose name contains q, each with its number of lines and how many the member has learned from the given side.";
        Responses[200] = "The families with the member's learned lines.";
        Responses[400] = "A malformed search or colour.";
        Responses[401] = "Not signed in.";
    }
}
