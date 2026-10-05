namespace Chess.Backend.WebApi.Admin;

internal sealed class ImportBroadcastsSummary : Summary<ImportBroadcastsEndpoint>
{
    public ImportBroadcastsSummary()
    {
        Summary = "Import a month of lichess broadcasts";
        Description = "Admins only. Starts streaming lichess's broadcast file for the month (CC BY-SA 4.0) into the library: finished standard games with both players at LibraryBroadcasts:MinElo or more, blitz and bullet left out, positions stored for the first LibraryBroadcasts:PositionPlies plies. One month at a time; running a month again adds only what is missing.";
        Responses[202] = "The run started; follow it in the runs list.";
        Responses[400] = "Not a month, or one lichess has not published.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Not an admin.";
        Responses[409] = "Another month is being imported.";
    }
}
