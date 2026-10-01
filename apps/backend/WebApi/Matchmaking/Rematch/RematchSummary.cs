namespace Chess.Backend.WebApi.Matchmaking;

internal sealed class RematchSummary : Summary<RematchEndpoint>
{
    public RematchSummary()
    {
        Summary = "Ask for a rematch";
        Description = "Offers a rematch of a finished game to the other player, or accepts theirs. The rematch is an invite whose id is the game's id: same time control, colours swapped, live on invite:{id}.";
        ExampleRequest = new InviteRouteRequest { Id = "01926a2b3c4d7e8f9a0b1c2d3e4f5a6b" };
        Responses[200] = "The rematch invite: open while the other player decides, accepted with its game once they agree.";
        Responses[400] = "The game id is malformed, or the game was against the computer.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Only the two players can ask for a rematch.";
        Responses[404] = "No such game.";
        Responses[409] = "The game is still on, or the rematch was cancelled or expired.";
        Responses[504] = "The invite did not answer in time.";
    }
}
