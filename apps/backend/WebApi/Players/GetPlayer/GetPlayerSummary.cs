namespace Chess.Backend.WebApi.Players;

internal sealed class GetPlayerSummary : Summary<GetPlayerEndpoint>
{
    public GetPlayerSummary()
    {
        Summary = "Get a player's profile";
        Description = "Any signed-in user may read any player's profile: name, member since, and wins/draws/losses in total and per time control (aborted games do not count). Never email or full name. Eventually consistent (read replica).";
        ExampleRequest = new PlayerRouteRequest { Id = 12 };
        Responses[200] = "The profile.";
        Responses[400] = "The id is not a number.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such player.";
        Responses[503] = "The read replica is unavailable.";
    }
}
