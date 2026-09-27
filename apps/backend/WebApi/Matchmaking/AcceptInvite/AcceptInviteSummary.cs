namespace Chess.Backend.WebApi.Matchmaking;

internal sealed class AcceptInviteSummary : Summary<AcceptInviteEndpoint>
{
    public AcceptInviteSummary()
    {
        Summary = "Accept an invite";
        Description = "Accepts an open invite: the game starts with the creator's colour honoured, and its id is in the answer.";
        ExampleRequest = new InviteRouteRequest { Id = "7c9e6679742540de944be07fc1f90ae7" };
        Responses[200] = "The accepted invite, with its game.";
        Responses[400] = "The invite id is malformed.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such invite.";
        Responses[504] = "The invite did not answer in time.";
        Responses[409] = "Already accepted, cancelled or expired, or it is your own invite.";
    }
}
