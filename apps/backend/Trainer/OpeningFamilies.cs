namespace Chess.Backend.Trainer;

/// <summary>A family or variation that can be trained: its name and how many lines it drills.</summary>
internal sealed record FamilyInfo(string Name, int Lines);

/// <summary>A line to drill: its end position (the id), name, ECO and moves from the start.</summary>
internal sealed record TrainerLine(string Key, string Name, string Eco, IReadOnlyList<string> Moves);

/// <summary>
/// The named openings grouped for the trainer (opening-trainer D2–D3), pure over the seeded rows. A family is the name
/// before the first ':' ("Sicilian Defense"); a variation the name before the first ',' ("Sicilian Defense: Najdorf
/// Variation"). The lines a group drills are its rows that no other row of the group extends.
/// </summary>
internal sealed class OpeningFamilies
{
    private readonly List<TrainerLine> _lines;
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, IReadOnlyList<TrainerLine>> _groups = new(StringComparer.Ordinal);

    public OpeningFamilies(IEnumerable<Opening> openings)
    {
        ArgumentNullException.ThrowIfNull(openings);
        _lines = [.. openings
            .Where(o => o.MovesUci is { Count: > 0 })
            .Select(o => new TrainerLine(o.PositionKey, o.Name, o.Eco, o.MovesUci!))
            .OrderBy(l => l.Name, StringComparer.Ordinal)];
    }

    /// <summary>Every family with its number of lines, by name.</summary>
    public IReadOnlyList<FamilyInfo> Families() =>
        [.. _lines.Select(l => FamilyOf(l.Name)).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).Select(Info)];

    /// <summary>Families and variations whose name contains <paramref name="text"/>, any case, by name.</summary>
    public IReadOnlyList<FamilyInfo> Search(string text)
    {
        ArgumentNullException.ThrowIfNull(text);
        string q = text.Trim();
        return [.. _lines
            .SelectMany(l => new[] { FamilyOf(l.Name), VariationOf(l.Name) })
            .Distinct(StringComparer.Ordinal)
            .Where(n => n.Contains(q, StringComparison.OrdinalIgnoreCase))
            .Order(StringComparer.Ordinal)
            .Select(Info)];
    }

    /// <summary>The lines a family or variation drills, by name; empty when <paramref name="group"/> names none.</summary>
    public IReadOnlyList<TrainerLine> Lines(string group)
    {
        ArgumentNullException.ThrowIfNull(group);
        return _groups.GetOrAdd(group, g =>
        {
            List<TrainerLine> members = [.. _lines.Where(l => InGroup(l.Name, g))];
            return [.. members.Where(l => !members.Any(m => m.Moves.Count > l.Moves.Count && m.Moves.Take(l.Moves.Count).SequenceEqual(l.Moves, StringComparer.Ordinal)))];
        });
    }

    /// <summary>The family a line belongs to (the name before the first ':').</summary>
    public static string FamilyName(string lineName)
    {
        ArgumentNullException.ThrowIfNull(lineName);
        return FamilyOf(lineName);
    }

    /// <summary>One line by its id, or null.</summary>
    public TrainerLine? Line(string key) => _lines.FirstOrDefault(l => l.Key == key);

    private FamilyInfo Info(string group) => new(group, Lines(group).Count);

    private static bool InGroup(string name, string group) =>
        name == group || (name.StartsWith(group, StringComparison.Ordinal) && name.Length > group.Length && name[group.Length] is ':' or ',');

    private static string FamilyOf(string name) => name.Split(':', 2)[0].Trim();

    private static string VariationOf(string name) => name.Split(',', 2)[0].Trim();
}
