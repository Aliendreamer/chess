namespace Chess.Backend.WebApi.Games;

internal sealed class ClaimSummary : Summary<ClaimEndpoint>
{
    public ClaimSummary()
    {
        Summary = "Claim an abandoned game";
        Description = "When the opponent has been away a minute, ends the game: claim the win or call it a draw (reason Abandonment).";
        ExampleRequest = new ClaimRequest { Id = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f", Outcome = ClaimOutcomes.Win };
        Responses[200] = "The ended game.";
        Responses[400] = "The game id or the body is malformed.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Only the two players can act in this game.";
        Responses[404] = "No such game.";
        Responses[504] = "The game did not answer in time.";
        Responses[409] = "Your opponent is here, or has not been away for a minute yet.";
    }
}
