namespace Chess.Backend.WebApi.Admin;

internal sealed class ListDeadLettersSummary : Summary<ListDeadLettersEndpoint>
{
    public ListDeadLettersSummary()
    {
        Summary = "List parked projection records";
        Description = "Records a projection could not apply after its retries, newest first, optionally for one projection. Read from the primary.";
        ExampleRequest = new ListDeadLettersRequest { GroupId = "chess.rm-games", Limit = 50 };
        Responses[200] = "A page; follow nextCursor for more.";
        Responses[400] = "Invalid limit or cursor.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Admins only.";
    }
}
