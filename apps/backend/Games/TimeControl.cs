using System.Globalization;

namespace Chess.Backend.Games;

internal enum TimeCategory
{
    Bullet,
    Blitz,
    Rapid,
    Classical,

    /// <summary>No clocks at all (engine-play D4): only games against the engine, never the queue or invites.</summary>
    Untimed,

    /// <summary>A deadline per move instead of a clock (correspondence-games D1): invites only.</summary>
    Correspondence,
}

/// <summary>
/// A live time control: initial minutes + Fischer increment seconds, written <c>5+3</c>. Only the ROADMAP D12 presets
/// exist; anything else is refused at the edge, so the actor never sees an arbitrary clock.
/// </summary>
internal readonly record struct TimeControl(int Minutes, int IncrementSeconds, TimeCategory Category)
{
    public static IReadOnlyList<TimeControl> Presets { get; } =
    [
        new(1, 0, TimeCategory.Bullet),
        new(2, 1, TimeCategory.Bullet),
        new(3, 0, TimeCategory.Blitz),
        new(3, 2, TimeCategory.Blitz),
        new(5, 0, TimeCategory.Blitz),
        new(5, 3, TimeCategory.Blitz),
        new(10, 0, TimeCategory.Rapid),
        new(10, 5, TimeCategory.Rapid),
        new(15, 10, TimeCategory.Rapid),
        new(30, 20, TimeCategory.Classical),
        new(90, 30, TimeCategory.Classical),
    ];

    /// <summary>No clock runs, no flag falls, no increment; written <c>untimed</c>.</summary>
    public static TimeControl Untimed { get; } = new(0, 0, TimeCategory.Untimed);

    public bool IsUntimed => Category == TimeCategory.Untimed;

    /// <summary>A week per move, reset after every move; written <c>7d</c>. Its length is <c>Correspondence:MoveDeadline</c>.</summary>
    public static TimeControl Correspondence7 { get; } = new(0, 0, TimeCategory.Correspondence);

    public bool IsCorrespondence => Category == TimeCategory.Correspondence;

    /// <summary>A running clock with flag and increment; untimed and correspondence games have none.</summary>
    public bool HasClock => !IsUntimed && !IsCorrespondence;

    public long InitialMs => Minutes * 60_000L;

    public long IncrementMs => IncrementSeconds * 1_000L;

    public static bool TryParse(string? text, out TimeControl timeControl)
    {
        foreach (TimeControl preset in Presets)
        {
            if (string.Equals(preset.ToString(), text, StringComparison.Ordinal))
            {
                timeControl = preset;
                return true;
            }
        }

        timeControl = default;
        return false;
    }

    /// <summary>A preset or <c>untimed</c>: what a game's journal may hold. <see cref="TryParse"/> stays presets-only for the edge.</summary>
    public static bool TryParseAny(string? text, out TimeControl timeControl)
    {
        if (string.Equals(text, Untimed.ToString(), StringComparison.Ordinal))
        {
            timeControl = Untimed;
            return true;
        }

        return TryParseInvite(text, out timeControl);
    }

    /// <summary>What an invite may use: a preset or <c>7d</c>. The queue stays presets-only (<see cref="TryParse"/>).</summary>
    public static bool TryParseInvite(string? text, out TimeControl timeControl)
    {
        if (string.Equals(text, Correspondence7.ToString(), StringComparison.Ordinal))
        {
            timeControl = Correspondence7;
            return true;
        }

        return TryParse(text, out timeControl);
    }

    public override string ToString() => Category switch
    {
        TimeCategory.Untimed => "untimed",
        TimeCategory.Correspondence => "7d",
        _ => string.Create(CultureInfo.InvariantCulture, $"{Minutes}+{IncrementSeconds}"),
    };
}

/// <summary>
/// When a game may leave memory, by game type (ROADMAP D22, design D8). Live controls never passivate while playing —
/// their clock timers must keep running — and leave a minute after the end. Games without a clock (untimed,
/// correspondence) have nothing to keep, so they also leave after <paramref name="untimedIdle"/> without a command and
/// recover unchanged (engine-play D4, correspondence-games D2).
/// </summary>
internal sealed record PassivationPolicy(TimeSpan? WhilePlaying, TimeSpan? AfterEnd)
{
    public static PassivationPolicy Live { get; } = new(WhilePlaying: null, AfterEnd: TimeSpan.FromMinutes(1));

    public static PassivationPolicy For(TimeControl timeControl, TimeSpan untimedIdle) =>
        timeControl.HasClock ? Live : new(WhilePlaying: untimedIdle, AfterEnd: Live.AfterEnd);
}
