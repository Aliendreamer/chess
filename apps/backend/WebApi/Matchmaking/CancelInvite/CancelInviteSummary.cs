namespace Chess.Backend.WebApi.Matchmaking;

internal sealed class CancelInviteSummary : Summary<CancelInviteEndpoint>
{
    public CancelInviteSummary()
    {
        Summary = "Cancel an invite";
        Description = "Cancels your own open invite.";
        ExampleRequest = new InviteRouteRequest { Id = "7c9e6679742540de944be07fc1f90ae7" };
        Responses[200] = "The cancelled invite.";
        Responses[400] = "The invite id is malformed.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such invite.";
        Responses[504] = "The invite did not answer in time.";
        Responses[403] = "Only the creator can cancel.";
        Responses[409] = "Not open any more.";
    }
}
