namespace Chess.Backend.WebApi.Challenges;

internal sealed class CancelChallengeSummary : Summary<CancelChallengeEndpoint>
{
    public CancelChallengeSummary()
    {
        Summary = "Cancel a challenge";
        Description = "The challenger withdraws the challenge; it leaves the other member's banner.";
        ExampleRequest = new ChallengeRouteRequest { Id = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f" };
        Responses[200] = "The cancelled challenge.";
        Responses[400] = "The challenge id is malformed.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Only the challenger can withdraw it.";
        Responses[404] = "No such challenge.";
        Responses[409] = "The challenge has already ended.";
        Responses[504] = "The challenge did not answer in time.";
    }
}
