namespace Chess.Backend.WebApi.Pings;

internal sealed class GetPingLiveSummary : Summary<GetPingLiveEndpoint>
{
    public GetPingLiveSummary()
    {
        Summary = "Read a ping live";
        Description = "The ping's state straight from its actor (not the replica).";
        ExampleRequest = new GetPingLiveRequest { Id = "demo-1" };
        Responses[200] = "The ping now.";
        Responses[401] = "Not signed in.";
        Responses[502] = "Unexpected reply from the ping.";
        Responses[504] = "The ping did not answer in time.";
        Responses[400] = "The ping id is invalid.";
    }
}
