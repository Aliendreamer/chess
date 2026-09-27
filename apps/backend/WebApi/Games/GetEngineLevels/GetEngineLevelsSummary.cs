namespace Chess.Backend.WebApi.Games;

internal sealed class GetEngineLevelsSummary : Summary<GetEngineLevelsEndpoint>
{
    public GetEngineLevelsSummary()
    {
        Summary = "The computer's levels";
        Description = "The levels you can play the computer at, weakest first: Casual, Club, Expert, Master and Maximum.";
        Responses[200] = "The levels with their names.";
        Responses[401] = "Not signed in.";
    }
}
