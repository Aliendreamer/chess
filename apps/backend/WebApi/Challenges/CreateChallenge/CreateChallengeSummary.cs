namespace Chess.Backend.WebApi.Challenges;

internal sealed class CreateChallengeSummary : Summary<CreateChallengeEndpoint>
{
    public CreateChallengeSummary()
    {
        Summary = "Challenge a member";
        Description = "Challenges an online member who is not playing to a preset game type, with the challenger's colour (white, black or random). The challenge is an invite reserved for that member, open 60 seconds; it shows on their user:{id} topic and ends on invite:{id} (accepted with its game, declined, cancelled or expired).";
        ExampleRequest = new CreateChallengeRequest { OpponentId = 2, TimeControl = "5+3", Color = "white" };
        Responses[200] = "The open challenge.";
        Responses[400] = "No member named, not a preset time control, or not a colour.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such member.";
        Responses[409] = "Yourself, the member is offline or playing or already challenged, or you already have a challenge out.";
        Responses[504] = "Presence or the challenge did not answer in time.";
    }
}
