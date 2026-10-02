namespace Chess.Backend.WebApi.News;

internal sealed class ListEventsSummary : Summary<ListEventsEndpoint>
{
    public ListEventsSummary()
    {
        Summary = "Tournaments being played now";
        Description = "From lichess's broadcast list, asked every News:EventsMinutes: names, places, time controls and current rounds with links to lichess. Live rounds first, then the most important, then the earliest; empty when the last answer is more than an hour old.";
        Responses[200] = "The tournaments (possibly none).";
        Responses[401] = "Not signed in.";
        Responses[503] = "The read replica is unavailable.";
    }
}
