namespace Chess.Backend.WebApi.Matchmaking;

internal sealed class JoinQueueSummary : Summary<JoinQueueEndpoint>
{
    public JoinQueueSummary()
    {
        Summary = "Join a queue";
        Description = "Joins the first-come-first-served queue of a preset time control, or with ?heartbeat=true keeps your place. Answers waiting (with your place) or matched (with the game).";
        ExampleRequest = new JoinQueueRequest { TimeControl = "5+3" };
        Responses[200] = "Waiting or matched.";
        Responses[400] = "Not a preset time control.";
        Responses[401] = "Not signed in.";
        Responses[504] = "Matchmaking did not answer in time; retry.";
    }
}
