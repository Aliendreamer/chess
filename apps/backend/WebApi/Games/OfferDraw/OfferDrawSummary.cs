namespace Chess.Backend.WebApi.Games;

internal sealed class OfferDrawSummary : Summary<OfferDrawEndpoint>
{
    public OfferDrawSummary()
    {
        Summary = "Offer a draw";
        Description = "Offers a draw. Offering against the opponent's pending offer accepts it.";
        ExampleRequest = new GameRouteRequest { Id = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f" };
        Responses[200] = "The game with the offer pending (or drawn, when both offered).";
        Responses[400] = "The game id or the body is malformed.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Only the two players can act in this game.";
        Responses[404] = "No such game.";
        Responses[504] = "The game did not answer in time.";
        Responses[409] = "An offer is already pending, a re-offer needs a move first, or the game is over.";
    }
}
