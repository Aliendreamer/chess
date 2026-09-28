namespace Chess.Backend.WebApi.Analysis;

internal sealed class AnalysePositionsSummary : Summary<AnalysePositionsEndpoint>
{
    public AnalysePositionsSummary()
    {
        Summary = "Analyse positions";
        Description = "Answers each position with the best known evaluation at the chosen think time or longer (the cache is shared "
            + "by everyone), and asks the engine for the others; call again for those still missing. Scores are from White's side.";
        ExampleRequest = new AnalysePositionsRequest { Positions = ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"], Think = "normal" };
        Responses[200] = "Each position with its evaluation, or null while the engine works on it.";
        Responses[400] = "Not a think time, no positions, too many, or a position that is not a FEN.";
        Responses[401] = "Not signed in.";
    }
}
