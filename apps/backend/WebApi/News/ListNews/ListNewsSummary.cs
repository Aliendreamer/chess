namespace Chess.Backend.WebApi.News;

internal sealed class ListNewsSummary : Summary<ListNewsEndpoint>
{
    public ListNewsSummary()
    {
        Summary = "Chess news headlines";
        Description = "Headlines from the configured chess news feeds, newest first, keyset paged, optionally one source's. Only titles and links to the articles on their own sites are kept — never the articles.";
        Responses[200] = "A page of headlines.";
        Responses[400] = "A malformed source, limit or cursor.";
        Responses[401] = "Not signed in.";
        Responses[503] = "The read replica is unavailable.";
    }
}
