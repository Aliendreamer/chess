namespace Chess.Backend.WebApi.Trainer;

internal sealed class GetStudySummary : Summary<GetStudyEndpoint>
{
    public GetStudySummary()
    {
        Summary = "A study's lines to drill";
        Description = "The member's own study: title, start position and its lines for the side in tree order (main line first), each with its key, moves (UCI), box and due time (null when never trained). Another member's study is not found, even when shared.";
        Responses[200] = "The study's lines.";
        Responses[400] = "A malformed id or colour.";
        Responses[401] = "Not signed in.";
        Responses[404] = "Not one of the member's studies.";
    }
}
