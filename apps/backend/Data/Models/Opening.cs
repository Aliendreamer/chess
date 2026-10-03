namespace Chess.Backend.Data.Models;

/// <summary>
/// A named opening position (game-library), from lichess's <c>chess-openings</c> list (CC0): keyed by position, so every
/// move order reaching it gets the same name. A game's opening is the deepest named position it reaches.
/// </summary>
internal sealed class Opening
{
    public required string PositionKey { get; set; }

    public required string Eco { get; set; }

    public required string Name { get; set; }

    /// <summary>How many plies the list's own line takes to reach it: the deeper, the more specific.</summary>
    public int Ply { get; set; }

    /// <summary>The line's moves from the start (UCI), for the trainer (opening-trainer); null on rows seeded before it.</summary>
    public List<string>? MovesUci { get; set; }
}
