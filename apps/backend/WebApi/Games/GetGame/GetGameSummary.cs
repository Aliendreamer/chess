namespace Chess.Backend.WebApi.Games;

internal sealed class GetGameSummary : Summary<GetGameEndpoint>
{
    public GetGameSummary()
    {
        Summary = "Get a game";
        Description = "A game's summary: players by name, time control, status, result. Eventually consistent (read replica); a finished game's answer may be cached by the browser.";
        ExampleRequest = new GameRouteRequest { Id = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f" };
        Responses[200] = "The game.";
        Responses[400] = "The game id is malformed.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such game on the replica (yet).";
        Responses[503] = "The read replica is unavailable.";
    }
}
