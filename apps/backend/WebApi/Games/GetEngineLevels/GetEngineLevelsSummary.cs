namespace Chess.Backend.WebApi.Games;

internal sealed class GetEngineLevelsSummary : Summary<GetEngineLevelsEndpoint>
{
    public GetEngineLevelsSummary()
    {
        Summary = "The computer's levels";
        Description = "The levels you can play the computer at, weakest first: 1320, 1600, 2000, 2400 (Elo-limited) and max.";
        Responses[200] = "The levels with their names.";
        Responses[401] = "Not signed in.";
    }
}
