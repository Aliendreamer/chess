namespace Chess.Backend.WebApi.Trainer;

internal sealed class RecordResultSummary : Summary<RecordResultEndpoint>
{
    public RecordResultSummary()
    {
        Summary = "Record a drill";
        Description = "A finished run of a line from one side: with no mistakes the line moves up one box (due after 1, 3, 7, 14 or 30 days), with any it goes back to box 0, due at once. Learned from box 3. 404 for an unknown line.";
        Responses[200] = "The line's new box and due time.";
        Responses[400] = "A malformed line, colour or count.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such line.";
    }
}
