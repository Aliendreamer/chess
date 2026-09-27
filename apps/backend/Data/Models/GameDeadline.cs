namespace Chess.Backend.Data.Models;

/// <summary>
/// A correspondence game's deadline for the player to move (correspondence-games D3), projected from
/// <c>game.events</c>; the deadline sweeper reads the due ones. <see cref="DueAt"/> is null once the game has ended, and
/// the row stays so a replay is skipped by <see cref="LastSeq"/>, the projection's watermark and concurrency token.
/// </summary>
internal sealed class GameDeadline
{
    public Guid GameId { get; set; }

    public DateTimeOffset? DueAt { get; set; }

    public long LastSeq { get; set; }
}
