namespace Chess.Backend.Data.Models;

/// <summary>That a member's mistakes of one game's complete review are in their <c>mistake_drills</c> (training D2): copied once.</summary>
internal sealed class TrainingSynced
{
    public long UserId { get; set; }

    public Guid GameId { get; set; }

    public DateTimeOffset SyncedAt { get; set; }
}
