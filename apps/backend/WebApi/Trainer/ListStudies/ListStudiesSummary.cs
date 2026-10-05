namespace Chess.Backend.WebApi.Trainer;

internal sealed class ListStudiesSummary : Summary<ListStudiesEndpoint>
{
    public ListStudiesSummary()
    {
        Summary = "My studies in the trainer";
        Description = "The member's own studies, newest first, keyset paged, each with how many lines it has for the side (every path from its start to the end of a line that has a move for that side) and how many are learned (box 3 or more).";
        Responses[200] = "The studies.";
        Responses[400] = "A malformed colour, limit or cursor.";
        Responses[401] = "Not signed in.";
    }
}
