namespace Chess.Backend.WebApi.Games;

internal sealed class ListGamesSummary : Summary<ListGamesEndpoint>
{
    public ListGamesSummary()
    {
        Summary = "List games";
        Description = "Games being played or ended, newest activity first. Eventually consistent (read replica).";
        ExampleRequest = new ListGamesRequest { Status = "ended", Limit = 20 };
        Responses[200] = "A page, newest first; follow nextCursor for more.";
        Responses[400] = "Invalid status, limit or cursor.";
        Responses[401] = "Not signed in.";
        Responses[503] = "The read replica is unavailable.";
    }
}
