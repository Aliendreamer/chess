namespace Chess.Backend.WebApi.Admin;

internal sealed class ImportLibrarySummary : Summary<ImportLibraryEndpoint>
{
    public ImportLibrarySummary()
    {
        Summary = "Import games into the library";
        Description = "Admins only. Up to 100 games parsed from PGN (headers and UCI moves; no annotations) with their source and licence. Each game is replayed from the standard position: an illegal one is refused with its move, one already in the library is a duplicate, the rest are stored with every position they reached and their opening.";
        Responses[200] = "Every game's outcome, by its place in the batch.";
        Responses[400] = "A malformed batch (no source or licence, too many games, a field too long).";
        Responses[401] = "Not signed in.";
        Responses[403] = "Not an admin.";
    }
}
