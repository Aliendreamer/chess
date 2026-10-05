namespace Chess.Backend.WebApi.Admin;

internal sealed class ListBroadcastImportsSummary : Summary<ListBroadcastImportsEndpoint>
{
    public ListBroadcastImportsSummary()
    {
        Summary = "The latest broadcast imports";
        Description = "Admins only. The 20 latest runs, newest first: month, state (running, finished, failed), games read, kept by the filter, imported, already in the library, and refused (illegal moves in the broadcast), with the error of a failed run.";
        Responses[200] = "The runs.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Not an admin.";
    }
}
