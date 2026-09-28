namespace Chess.Backend.WebApi.Studies;

internal sealed class ShareStudySummary : Summary<ShareStudyEndpoint>
{
    public ShareStudySummary()
    {
        Summary = "Share a study";
        Description = "Turns the study's link on or off for anyone signed in (read-only). Owner only.";
        ExampleRequest = new ShareStudyRequest { Shared = true };
        Responses[200] = "The study.";
        Responses[400] = "Not a study id.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such study of yours.";
    }
}
