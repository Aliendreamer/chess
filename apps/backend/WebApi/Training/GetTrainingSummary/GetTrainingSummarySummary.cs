namespace Chess.Backend.WebApi.Training;

internal sealed class GetTrainingSummarySummary : Summary<GetTrainingSummaryEndpoint>
{
    public GetTrainingSummarySummary()
    {
        Summary = "My training";
        Description = "games: the caller's own mistakes (their finished reviews are copied in first), how many are learned (box 3 and up) and due now. library: how many master positions there are, how many the caller has answered, learned and has due now.";
        Responses[200] = "The counts.";
        Responses[401] = "Not signed in.";
    }
}
