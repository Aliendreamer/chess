namespace Chess.Backend.WebApi.Games;

internal sealed class GetLiveSummary : Summary<GetLiveEndpoint>
{
    public GetLiveSummary()
    {
        Summary = "Watch a game";
        Description = "The game's current state from its actor (players, position, clocks, pending offers, presence).";
        ExampleRequest = new GameRouteRequest { Id = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f" };
        Responses[200] = "The game now.";
        Responses[400] = "The game id is malformed.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such game.";
        Responses[504] = "The game did not answer in time.";
    }
}
