namespace Chess.Backend.WebApi.Games;

internal sealed class MyGamesSummary : Summary<MyGamesEndpoint>
{
    public MyGamesSummary()
    {
        Summary = "My games";
        Description = "The signed-in player's games as either colour, newest first. Eventually consistent (read replica).";
        ExampleRequest = new MyGamesRequest { Limit = 20 };
        Responses[200] = "A page, newest first; follow nextCursor for more.";
        Responses[401] = "Not signed in.";
        Responses[503] = "The read replica is unavailable.";
        Responses[400] = "Invalid limit or cursor.";
    }
}
