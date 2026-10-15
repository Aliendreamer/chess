namespace Chess.Backend.WebApi.Challenges;

internal sealed class AcceptChallengeSummary : Summary<AcceptChallengeEndpoint>
{
    public AcceptChallengeSummary()
    {
        Summary = "Accept a challenge";
        Description = "The challenged member accepts: the game starts with the challenger on their colour; the answer carries its id.";
        ExampleRequest = new ChallengeRouteRequest { Id = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f" };
        Responses[200] = "The accepted challenge with its game.";
        Responses[400] = "The challenge id is malformed.";
        Responses[401] = "Not signed in.";
        Responses[403] = "The challenge is for another member.";
        Responses[404] = "No such challenge.";
        Responses[409] = "The challenge has already ended.";
        Responses[504] = "The challenge did not answer in time.";
    }
}
