namespace Chess.Backend.WebApi.Games;

internal sealed class GetMovesSummary : Summary<GetMovesEndpoint>
{
    public GetMovesSummary()
    {
        Summary = "Get the moves";
        Description = "Every move in ply order, with SAN and both clocks. Eventually consistent (read replica); a finished game's moves may be cached by the browser.";
        ExampleRequest = new GameRouteRequest { Id = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f" };
        Responses[200] = "The moves.";
        Responses[400] = "The game id is malformed.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such game on the replica (yet).";
        Responses[503] = "The read replica is unavailable.";
    }
}
