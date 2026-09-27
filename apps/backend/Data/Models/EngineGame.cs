namespace Chess.Backend.Data.Models;

/// <summary>
/// A game against the engine, as the engine request consumer knows it (engine-play D6): the engine's side and level,
/// filled from <c>game.created</c> so every later event can tell whether the engine is to move. <see cref="LastSeq"/>
/// is that consumer's watermark for the game and its concurrency token. The row stays after the end (<see cref="Ended"/>),
/// so a replay of the game's events is skipped by the watermark instead of asking the engine to move again.
/// </summary>
internal sealed class EngineGame
{
    public Guid GameId { get; set; }

    public required string Side { get; set; }

    public required string Level { get; set; }

    public long LastSeq { get; set; }

    public bool Ended { get; set; }
}
