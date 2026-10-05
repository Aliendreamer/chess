namespace Chess.Backend.WebApi.Trainer;

internal sealed class RecordStudyResultSummary : Summary<RecordStudyResultEndpoint>
{
    public RecordStudyResultSummary()
    {
        Summary = "Record a run of a study line";
        Description = "A clean run moves the line up a box, a mistake sends it back to box 0, due at once. The line must be a line of the member's study for that side now: a key from before an edit that changed it is not found.";
        Responses[200] = "The line's new box and due time.";
        Responses[400] = "A malformed id, line key, colour or mistake count.";
        Responses[401] = "Not signed in.";
        Responses[404] = "Not one of the member's studies, or no such line in it.";
    }
}
