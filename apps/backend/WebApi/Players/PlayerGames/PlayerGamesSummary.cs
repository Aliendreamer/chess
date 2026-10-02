namespace Chess.Backend.WebApi.Players;

internal sealed class PlayerGamesSummary : Summary<PlayerGamesEndpoint>
{
    public PlayerGamesSummary()
    {
        Summary = "List a player's games";
        Description = "Any player's games as either colour, newest first, keyset paged: the same items as GET /api/me/games, seen from that player's side. Eventually consistent (read replica).";
        Responses[200] = "A page of games.";
        Responses[400] = "The id, limit or cursor is malformed.";
        Responses[401] = "Not signed in.";
        Responses[503] = "The read replica is unavailable.";
    }
}
