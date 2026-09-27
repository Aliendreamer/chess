namespace Chess.Backend.WebApi.Matchmaking;

internal sealed class LeaveQueueSummary : Summary<LeaveQueueEndpoint>
{
    public LeaveQueueSummary()
    {
        Summary = "Leave a queue";
        Description = "Leaves the queue at once (the entry would otherwise expire 60 s after the last heartbeat).";
        ExampleRequest = new LeaveQueueRequest { TimeControl = "5+3" };
        Responses[204] = "Left (or was not waiting).";
        Responses[400] = "Not a preset time control.";
        Responses[401] = "Not signed in.";
    }
}
