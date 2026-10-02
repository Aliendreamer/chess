namespace Chess.Backend.Data.Models;

/// <summary>
/// A position a library game reached (game-library): the position key after <see cref="Ply"/>, so "which famous games
/// reached this position" is one lookup. The start position is not stored — every game has it.
/// </summary>
internal sealed class LibraryPosition
{
    /// <summary><c>Analysis.PositionKey.Of(fen)</c>: the FEN's first four fields, en passant only when a pawn can take.</summary>
    public required string PositionKey { get; set; }

    public Guid GameId { get; set; }

    public int Ply { get; set; }
}
