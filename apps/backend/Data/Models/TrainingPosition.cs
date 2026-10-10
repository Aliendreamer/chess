namespace Chess.Backend.Data.Models;

/// <summary>
/// A critical moment from a library game (training D1): a position where one move is clearly best, found by the miner,
/// with the move the master played, the moves the engine accepts, its line and the game's facts for the filters.
/// Written by the miner on the primary, read by every member.
/// </summary>
internal sealed class TrainingPosition
{
    public const string Middlegame = "middlegame";
    public const string Endgame = "endgame";

    /// <summary>Random (v4), so "a new position in random order" is a seek from a random id.</summary>
    public Guid Id { get; set; }

    /// <summary><c>Analysis.PositionKey.Of(fen)</c>: one row per position, whichever game reached it first.</summary>
    public required string PositionKey { get; set; }

    public required string Fen { get; set; }

    /// <summary><c>white</c> or <c>black</c>.</summary>
    public required string SideToMove { get; set; }

    public Guid LibraryGameId { get; set; }

    /// <summary>The ply of the position (moves played before it); the master's move is ply + 1.</summary>
    public int Ply { get; set; }

    public required string MasterUci { get; set; }

    /// <summary>The first moves of the engine's lines within the practice tolerance of its best.</summary>
    public List<string> AcceptedUci { get; set; } = [];

    /// <summary>The engine's best line, UCI from the position.</summary>
    public List<string> BestLine { get; set; } = [];

    /// <summary>Winning chances (−1…1 scale) the best move gains over the second, for the side to move.</summary>
    public float Gap { get; set; }

    public string? Eco { get; set; }

    public string? OpeningName { get; set; }

    /// <summary><see cref="Middlegame"/> or <see cref="Endgame"/>.</summary>
    public required string Phase { get; set; }

    public required string White { get; set; }

    public required string Black { get; set; }

    public string? Event { get; set; }

    public int? Year { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
