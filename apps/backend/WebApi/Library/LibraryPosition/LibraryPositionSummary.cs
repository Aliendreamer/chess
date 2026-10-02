namespace Chess.Backend.WebApi.Library;

internal sealed class LibraryPositionSummary : Summary<LibraryPositionEndpoint>
{
    public LibraryPositionSummary()
    {
        Summary = "Library games at a position";
        Description = "How many library games reached the position and how they ended (white wins, draws, black wins), and the first 50 of them, newest year first, each with the ply it stood there. The key is a FEN's first four fields.";
        Responses[200] = "The games and the counts (zero when none).";
        Responses[400] = "Not a position key.";
        Responses[401] = "Not signed in.";
        Responses[503] = "The read replica is unavailable.";
    }
}
