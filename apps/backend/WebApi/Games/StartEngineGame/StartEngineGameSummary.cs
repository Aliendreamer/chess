using Chess.Backend.Games;

namespace Chess.Backend.WebApi.Games;

internal sealed class StartEngineGameSummary : Summary<StartEngineGameEndpoint>
{
    public StartEngineGameSummary()
    {
        Summary = "Play the computer";
        Description = "Starts an untimed game against Stockfish at the chosen level, with you as White, Black or a random colour. "
            + "The engine replies to each move within about 5–10 s; draw offers are not taken and nobody can claim abandonment.";
        ExampleRequest = new StartEngineGameRequest { Level = "1600", Color = SideNames.White };
        Responses[201] = "The new game's view (engineSide and engineLevel set).";
        Responses[400] = "Not a level, or not a colour.";
        Responses[401] = "Not signed in.";
        Responses[504] = "The game did not answer in time.";
    }
}
