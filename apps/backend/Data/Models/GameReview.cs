namespace Chess.Backend.Data.Models;

/// <summary>
/// That a finished game's engine review was asked for (game-review D3), by whom and when. The review itself is the
/// game's positions in <c>position_evaluations</c>, read on demand.
/// </summary>
internal sealed class GameReview
{
    public Guid GameId { get; set; }

    public long RequestedBy { get; set; }

    public DateTimeOffset RequestedAt { get; set; }
}
