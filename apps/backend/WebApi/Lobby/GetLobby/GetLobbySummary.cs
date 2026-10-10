namespace Chess.Backend.WebApi.Lobby;

internal sealed class GetLobbySummary : Summary<GetLobbyEndpoint>
{
    public GetLobbySummary()
    {
        Summary = "The lobby";
        Description = "Games in play, people waiting in each preset queue (null when matchmaking does not answer in time). One answer is shared by every caller for Lobby:CacheSeconds; the replica may lag.";
        Responses[200] = "The lobby.";
        Responses[401] = "Not signed in.";
        Responses[503] = "The read replica is unavailable.";
    }
}
