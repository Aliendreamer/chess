namespace Chess.Backend.WebApi.Games;

internal sealed class MoveSummary : Summary<MoveEndpoint>
{
    public MoveSummary()
    {
        Summary = "Make a move";
        Description = "Makes a move in UCI (e2e4, e7e8q) as the player to move. Answers with the game after the move.";
        ExampleRequest = new MoveRequest { Id = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f", Uci = "e2e4" };
        Responses[200] = "The game after the move.";
        Responses[400] = "The game id or the body is malformed.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Only the two players can act in this game.";
        Responses[404] = "No such game.";
        Responses[504] = "The game did not answer in time.";
        Responses[409] = "Not your turn, or the game is over.";
        Responses[422] = "The move is illegal in this position.";
    }
}
