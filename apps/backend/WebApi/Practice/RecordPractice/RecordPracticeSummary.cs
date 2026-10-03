namespace Chess.Backend.WebApi.Practice;

internal sealed class RecordPracticeSummary : Summary<RecordPracticeEndpoint>
{
    public RecordPracticeSummary()
    {
        Summary = "Record a practice answer";
        Description = "Right: the position moves up one box (due after 1, 3, 7, 14 or 30 days). Wrong: back to box 0, due at once. Learned from box 3. 404 for a position not in the caller's practice.";
        Responses[200] = "The position's new box and due time.";
        Responses[400] = "A malformed game id or ply.";
        Responses[401] = "Not signed in.";
        Responses[404] = "Not in the caller's practice.";
    }
}
