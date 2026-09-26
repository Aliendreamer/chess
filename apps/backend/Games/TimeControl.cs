using System.Globalization;

namespace Chess.Backend.Games;

internal enum TimeCategory
{
    Bullet,
    Blitz,
    Rapid,
    Classical,
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

    public override string ToString() => string.Create(CultureInfo.InvariantCulture, $"{Minutes}+{IncrementSeconds}");
}
