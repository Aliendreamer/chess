namespace Chess.Backend.Games;

/// <summary>
/// When a game may leave memory, by game type (ROADMAP D22, design D8). Live controls never passivate while playing —
/// their clock timers must keep running — and leave a minute after the end. Correspondence (Part 3) will add a policy
/// that passivates while waiting and relies on a persisted deadline instead.
/// </summary>
internal sealed record PassivationPolicy(TimeSpan? WhilePlaying, TimeSpan? AfterEnd)
{
    public static PassivationPolicy Live { get; } = new(WhilePlaying: null, AfterEnd: TimeSpan.FromMinutes(1));

    public static PassivationPolicy For(TimeControl timeControl) => Live;
}
