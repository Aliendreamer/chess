namespace Chess.Backend.WebApi.Matchmaking;

internal sealed class CreateInviteSummary : Summary<CreateInviteEndpoint>
{
    public CreateInviteSummary()
    {
        Summary = "Create an invite link";
        Description = "Creates an invite for a preset time control and your colour; anyone signed in with the link may accept it within 24 h.";
        ExampleRequest = new CreateInviteRequest { TimeControl = "10+5", Color = "white" };
        Responses[201] = "The open invite (its id makes the link).";
        Responses[400] = "Not a preset time control, or not a colour.";
        Responses[401] = "Not signed in.";
        Responses[504] = "The invite did not answer in time.";
    }
}
