namespace Chess.Backend.WebApi.Analysis;

internal sealed class AnalysePositionSummary : Summary<AnalysePositionEndpoint>
{
    public AnalysePositionSummary()
    {
        Summary = "Analyse a position";
        Description = "Answers the position with the best known evaluation at the chosen think time or longer (the cache is shared "
            + "by everyone), or asks the engine for one; call again until it is there. Scores are from White's side.";
        ExampleRequest = new AnalysePositionRequest { Fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", Think = "normal" };
        Responses[200] = "The position with its evaluation, or null while the engine works on it.";
        Responses[400] = "Not a think time, or not a position (FEN).";
        Responses[401] = "Not signed in.";
    }
}
