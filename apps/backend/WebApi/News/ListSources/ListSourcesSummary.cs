namespace Chess.Backend.WebApi.News;

internal sealed class ListSourcesSummary : Summary<ListSourcesEndpoint>
{
    public ListSourcesSummary()
    {
        Summary = "Chess news sources";
        Description = "The enabled news sources (id and name), from News:Feeds.";
        Responses[200] = "The sources.";
        Responses[401] = "Not signed in.";
    }
}
