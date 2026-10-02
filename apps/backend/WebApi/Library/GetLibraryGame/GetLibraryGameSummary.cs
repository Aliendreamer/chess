namespace Chess.Backend.WebApi.Library;

internal sealed class GetLibraryGameSummary : Summary<GetLibraryGameEndpoint>
{
    public GetLibraryGameSummary()
    {
        Summary = "Get a library game";
        Description = "A famous game's headers, source, licence and moves (UCI), to open on the analysis board.";
        Responses[200] = "The game.";
        Responses[400] = "The id is not a Guid.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such library game.";
        Responses[503] = "The read replica is unavailable.";
    }
}
