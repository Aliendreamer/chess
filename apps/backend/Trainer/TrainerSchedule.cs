namespace Chess.Backend.Trainer;

/// <summary>The line to drill next, or none for now with when the next one is due.</summary>
internal sealed record NextLine(string? Line, DateTimeOffset? NextDueAt);

/// <summary>
/// The trainer's Leitner schedule (opening-trainer D4), pure: a clean run moves a line up one box and spaces it out, a
/// mistake sends it back to box 0, due at once; the next line is the due one with the lowest box, then the oldest due,
/// then the first never trained. A line is learned from box 3.
/// </summary>
internal static class TrainerSchedule
{
    public const int MaxBox = 5;
    public const int LearnedBox = 3;

    /// <summary>Days until a line in a box is due again.</summary>
    private static readonly int[] DaysByBox = [0, 1, 3, 7, 14, 30];

    /// <summary>The box and due time after a run; <paramref name="box"/> is null for a line never trained.</summary>
    public static (int Box, DateTimeOffset DueAt) After(int? box, bool clean, DateTimeOffset now)
    {
        if (!clean)
        {
            return (0, now);
        }

        int next = Math.Min((box ?? 0) + 1, MaxBox);
        return (next, now.AddDays(DaysByBox[next]));
    }

    public static bool Learned(int box) => box >= LearnedBox;

    /// <summary><paramref name="lines"/> in the family's order; <paramref name="progress"/> by line for this member and side.</summary>
    public static NextLine Next(IReadOnlyList<string> lines, IReadOnlyDictionary<string, (int Box, DateTimeOffset Due)> progress, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(lines);
        ArgumentNullException.ThrowIfNull(progress);
        string? due = lines
            .Where(l => progress.TryGetValue(l, out (int Box, DateTimeOffset Due) p) && p.Due <= now)
            .OrderBy(l => progress[l].Box)
            .ThenBy(l => progress[l].Due)
            .FirstOrDefault();
        if (due is not null)
        {
            return new NextLine(due, null);
        }

        string? fresh = lines.FirstOrDefault(l => !progress.ContainsKey(l));
        if (fresh is not null)
        {
            return new NextLine(fresh, null);
        }

        DateTimeOffset? soonest = lines.Where(progress.ContainsKey).Select(l => (DateTimeOffset?)progress[l].Due).Min();
        return new NextLine(null, soonest);
    }
}
