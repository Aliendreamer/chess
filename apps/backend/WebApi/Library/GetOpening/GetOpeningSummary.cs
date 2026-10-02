namespace Chess.Backend.WebApi.Library;

internal sealed class GetOpeningSummary : Summary<GetOpeningEndpoint>
{
    public GetOpeningSummary()
    {
        Summary = "Name a position's opening";
        Description = "The ECO code and name of a named opening position (lichess chess-openings, CC0), by position key, so every move order reaching it gets the same name. 404 when the position is not named.";
        Responses[200] = "The opening.";
        Responses[400] = "Not a position key.";
        Responses[401] = "Not signed in.";
        Responses[404] = "The position has no name.";
        Responses[503] = "The read replica is unavailable.";
    }
}
