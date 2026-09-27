namespace Chess.Backend.WebApi.Games;

internal sealed class AcceptDrawSummary : Summary<AcceptDrawEndpoint>
{
    public AcceptDrawSummary()
    {
        Summary = "Accept a draw";
        Description = "Accepts the opponent's pending draw offer: the game ends 1/2-1/2.";
        ExampleRequest = new GameRouteRequest { Id = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f" };
        Responses[200] = "The drawn game.";
        Responses[400] = "The game id or the body is malformed.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Only the two players can act in this game.";
        Responses[404] = "No such game.";
        Responses[504] = "The game did not answer in time.";
        Responses[409] = "There is no offer from the opponent, or the game is over.";
    }
}
