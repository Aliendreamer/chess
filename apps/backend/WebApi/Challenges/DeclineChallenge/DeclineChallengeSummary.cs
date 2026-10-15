namespace Chess.Backend.WebApi.Challenges;

internal sealed class DeclineChallengeSummary : Summary<DeclineChallengeEndpoint>
{
    public DeclineChallengeSummary()
    {
        Summary = "Decline a challenge";
        Description = "The challenged member declines; the challenger sees it on invite:{id}.";
        ExampleRequest = new ChallengeRouteRequest { Id = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f" };
        Responses[200] = "The declined challenge.";
        Responses[400] = "The challenge id is malformed.";
        Responses[401] = "Not signed in.";
        Responses[403] = "The challenge is for another member.";
        Responses[404] = "No such challenge.";
        Responses[409] = "The challenge has already ended.";
        Responses[504] = "The challenge did not answer in time.";
    }
}
