namespace Chess.Backend.WebApi.Pings;

internal sealed class PostPingSummary : Summary<PostPingEndpoint>
{
    public PostPingSummary()
    {
        Summary = "Send a ping";
        Description = "Sends a ping to its actor (the Part 0 spine). Answers with the actor's state after it (read-your-write).";
        ExampleRequest = new PostPingRequest { Id = "demo-1", Text = "hello" };
        Responses[200] = "The ping after this one.";
        Responses[400] = "The ping id or text is invalid.";
        Responses[401] = "Not signed in.";
        Responses[502] = "Unexpected reply from the ping.";
        Responses[504] = "The ping did not answer in time.";
    }
}
