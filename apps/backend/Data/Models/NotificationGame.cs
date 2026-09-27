namespace Chess.Backend.Data.Models;

/// <summary>
/// A correspondence game as the notification consumer knows it (correspondence-games D4): its players and their names,
/// remembered from <c>game.created</c> so every later event can be mailed on its own. <see cref="LastSeq"/> is the
/// consumer's watermark for the game and its concurrency token; the row stays after the end, so a replay mails nothing.
/// </summary>
internal sealed class NotificationGame
{
    public Guid GameId { get; set; }

    public long WhiteId { get; set; }

    public long BlackId { get; set; }

    public required string WhiteName { get; set; }

    public required string BlackName { get; set; }

    public long LastSeq { get; set; }
}
