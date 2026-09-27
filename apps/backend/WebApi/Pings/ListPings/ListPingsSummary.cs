namespace Chess.Backend.WebApi.Pings;

internal sealed class ListPingsSummary : Summary<ListPingsEndpoint>
{
    public ListPingsSummary()
    {
        Summary = "List pings";
        Description = "Pings, most recently updated first. Eventually consistent (read replica).";
        ExampleRequest = new ListPingsRequest { Limit = 20 };
        Responses[200] = "A page; follow nextCursor for more.";
        Responses[400] = "Invalid limit or cursor.";
        Responses[401] = "Not signed in.";
        Responses[503] = "The read replica is unavailable.";
    }
}
