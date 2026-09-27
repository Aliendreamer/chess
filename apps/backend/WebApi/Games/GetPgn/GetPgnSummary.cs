namespace Chess.Backend.WebApi.Games;

internal sealed class GetPgnSummary : Summary<GetPgnEndpoint>
{
    public GetPgnSummary()
    {
        Summary = "Get the PGN";
        Description = "A finished game's PGN (D22), as application/x-chess-pgn. It never changes, so the browser may cache it.";
        ExampleRequest = new GameRouteRequest { Id = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f" };
        Responses[200] = "The PGN.";
        Responses[400] = "The game id is malformed.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such game, or it has not finished.";
        Responses[503] = "The read replica is unavailable.";
    }
}
