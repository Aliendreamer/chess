namespace Chess.Backend.WebApi.Studies;

internal sealed class GetStudySummary : Summary<GetStudyEndpoint>
{
    public GetStudySummary()
    {
        Summary = "A study";
        Description = "The study with its move tree; mine tells whether you may edit it.";
        Responses[200] = "The study.";
        Responses[400] = "Not a study id.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such study, or a private one that is not yours.";
    }
}
