namespace Chess.Backend.Data.Models;

/// <summary>
/// A position a library game reached (game-library): the position key after <see cref="Ply"/>, from the start position
/// (ply 0) on, so "which famous games reached this position" is one lookup. The move played next, the game's result
/// and its source are copied here so the explorer counts from this table alone (broadcast-explorer D6); library games
/// never change after import.
/// </summary>
internal sealed class LibraryPosition
{
    /// <summary><c>Analysis.PositionKey.Of(fen)</c>: the FEN's first four fields, en passant only when a pawn can take.</summary>
    public required string PositionKey { get; set; }

    public Guid GameId { get; set; }

    public int Ply { get; set; }

    /// <summary>The move played from this position; null where the game ended.</summary>
    public string? NextUci { get; set; }

    /// <summary>The game's result: <c>1-0</c>, <c>0-1</c>, <c>1/2-1/2</c> or <c>*</c>.</summary>
    public required string Result { get; set; }

    /// <summary>The game's source, e.g. "PGN Mentor".</summary>
    public required string Source { get; set; }
}
