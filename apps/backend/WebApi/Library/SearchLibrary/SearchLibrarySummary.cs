namespace Chess.Backend.WebApi.Library;

internal sealed class SearchLibrarySummary : Summary<SearchLibraryEndpoint>
{
    public SearchLibrarySummary()
    {
        Summary = "Search the game library";
        Description = "Famous games, newest year first (games without a year last), keyset paged. Every filter is optional: player (either colour) and event and opening match part of the name in any case; from/to are years; wc keeps World Championship games; eco takes a code or its start.";
        Responses[200] = "A page of games.";
        Responses[400] = "A malformed filter or cursor.";
        Responses[401] = "Not signed in.";
        Responses[503] = "The read replica is unavailable.";
    }
}
