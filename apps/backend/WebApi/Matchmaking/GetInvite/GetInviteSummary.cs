namespace Chess.Backend.WebApi.Matchmaking;

internal sealed class GetInviteSummary : Summary<GetInviteEndpoint>
{
    public GetInviteSummary()
    {
        Summary = "Get an invite";
        Description = "An invite's status: open, accepted (with its game), cancelled or expired.";
        ExampleRequest = new InviteRouteRequest { Id = "7c9e6679742540de944be07fc1f90ae7" };
        Responses[200] = "The invite.";
        Responses[400] = "The invite id is malformed.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such invite.";
        Responses[504] = "The invite did not answer in time.";
    }
}
