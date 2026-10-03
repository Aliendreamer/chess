namespace Chess.Backend.Trainer;

/// <summary>A family or variation with how many of its lines the member has learned from one side.</summary>
internal sealed record FamilyProgress(string Name, int Lines, int Learned);

/// <summary>A line of a family with the member's state for one side (box null: never trained).</summary>
internal sealed record LineProgress(string Key, string Name, string Eco, IReadOnlyList<string> Moves, int? Box, DateTimeOffset? DueAt);

/// <summary>What a recorded run did to the line.</summary>
internal sealed record RunResult(string LineKey, int Box, DateTimeOffset DueAt, bool Learned);

/// <summary>The family a member has trained from one side.</summary>
internal sealed record TrainedFamily(string Name, string Color, int Lines, int Learned);

/// <summary>The opening list grouped once per process (it is fixed at startup); see <see cref="OpeningFamilies"/>.</summary>
internal sealed class OpeningFamiliesCache(IServiceScopeFactory scopes) : IDisposable
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private OpeningFamilies? _families;

    public async Task<OpeningFamilies> GetAsync(CancellationToken ct)
    {
        if (_families is { } ready)
        {
            return ready;
        }

        await _gate.WaitAsync(ct);
        try
        {
            if (_families is null)
            {
                await using AsyncServiceScope scope = scopes.CreateAsyncScope();
                ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
                _families = new OpeningFamilies(await db.Openings.AsNoTracking().ToListAsync(ct));
            }

            return _families;
        }
        finally
        {
            _gate.Release();
        }
    }

    public void Dispose() => _gate.Dispose();
}

internal interface ITrainerService : IService
{
    Task<IReadOnlyList<FamilyProgress>> FamiliesAsync(long userId, string? search, string color, CancellationToken ct);

    /// <summary>A family's lines with the member's state; null when the name is no family or variation.</summary>
    Task<IReadOnlyList<LineProgress>?> FamilyAsync(long userId, string name, string color, CancellationToken ct);

    /// <summary>The line to drill next, or none with when the next is due; null when the name is no family or variation.</summary>
    Task<(LineProgress? Line, DateTimeOffset? NextDueAt)?> NextAsync(long userId, string name, string color, CancellationToken ct);

    /// <summary>Records a finished run; null when the line does not exist.</summary>
    Task<RunResult?> RecordAsync(long userId, string lineKey, string color, int mistakes, CancellationToken ct);

    /// <summary>The families the member has trained, per side.</summary>
    Task<IReadOnlyList<TrainedFamily>> MineAsync(long userId, CancellationToken ct);
}

/// <summary>The opening trainer (opening-trainer): the member's progress over <see cref="OpeningFamilies"/>, on the primary.</summary>
internal sealed class TrainerService(
    ProjectDbContext context,
    OpeningFamiliesCache families,
    TimeProvider clock,
    ILogger<TrainerService> logger) : BaseService(context, logger), ITrainerService
{
    public async Task<IReadOnlyList<FamilyProgress>> FamiliesAsync(long userId, string? search, string color, CancellationToken ct)
    {
        OpeningFamilies all = await families.GetAsync(ct);
        HashSet<string> learned = [.. await Context.TrainerProgress
            .Where(p => p.UserId == userId && p.Color == color && p.Box >= TrainerSchedule.LearnedBox)
            .Select(p => p.LineKey)
            .ToListAsync(ct)];
        IReadOnlyList<FamilyInfo> groups = string.IsNullOrWhiteSpace(search) ? all.Families() : all.Search(search);
        return [.. groups.Select(g => new FamilyProgress(g.Name, g.Lines, all.Lines(g.Name).Count(l => learned.Contains(l.Key))))];
    }

    public async Task<IReadOnlyList<LineProgress>?> FamilyAsync(long userId, string name, string color, CancellationToken ct)
    {
        IReadOnlyList<TrainerLine> lines = (await families.GetAsync(ct)).Lines(name);
        if (lines.Count == 0)
        {
            return null;
        }

        Dictionary<string, TrainerProgress> mine = await ProgressAsync(userId, color, lines, ct);
        return [.. lines.Select(l => With(l, mine.GetValueOrDefault(l.Key)))];
    }

    public async Task<(LineProgress? Line, DateTimeOffset? NextDueAt)?> NextAsync(long userId, string name, string color, CancellationToken ct)
    {
        IReadOnlyList<TrainerLine> lines = (await families.GetAsync(ct)).Lines(name);
        if (lines.Count == 0)
        {
            return null;
        }

        Dictionary<string, TrainerProgress> mine = await ProgressAsync(userId, color, lines, ct);
        NextLine next = TrainerSchedule.Next(
            [.. lines.Select(l => l.Key)],
            mine.ToDictionary(p => p.Key, p => (p.Value.Box, p.Value.DueAt), StringComparer.Ordinal),
            clock.GetUtcNow());
        TrainerLine? line = next.Line is null ? null : lines.First(l => l.Key == next.Line);
        return (line is null ? null : With(line, mine.GetValueOrDefault(line.Key)), next.NextDueAt);
    }

    public async Task<RunResult?> RecordAsync(long userId, string lineKey, string color, int mistakes, CancellationToken ct)
    {
        if ((await families.GetAsync(ct)).Line(lineKey) is null)
        {
            return null;
        }

        DateTimeOffset now = clock.GetUtcNow();
        TrainerProgress? row = await Context.TrainerProgress.SingleOrDefaultAsync(p => p.UserId == userId && p.LineKey == lineKey && p.Color == color, ct);
        (int box, DateTimeOffset due) = TrainerSchedule.After(row?.Box, mistakes == 0, now);
        if (row is null)
        {
            row = new TrainerProgress { UserId = userId, LineKey = lineKey, Color = color };
            Context.TrainerProgress.Add(row);
        }

        row.Box = box;
        row.DueAt = due;
        row.LastClean = mistakes == 0;
        row.UpdatedAt = now;
        await Context.SaveChangesAsync(ct);
        return new RunResult(lineKey, box, due, TrainerSchedule.Learned(box));
    }

    public async Task<IReadOnlyList<TrainedFamily>> MineAsync(long userId, CancellationToken ct)
    {
        OpeningFamilies all = await families.GetAsync(ct);
        List<TrainerProgress> rows = await Context.TrainerProgress.AsNoTracking().Where(p => p.UserId == userId).ToListAsync(ct);
        return [.. rows
            .Select(r => (Row: r, Line: all.Line(r.LineKey)))
            .Where(x => x.Line is not null)
            .GroupBy(x => (Family: OpeningFamilies.FamilyName(x.Line!.Name), x.Row.Color))
            .Select(g =>
            {
                HashSet<string> keys = [.. all.Lines(g.Key.Family).Select(l => l.Key)];
                return new TrainedFamily(g.Key.Family, g.Key.Color, keys.Count, g.Count(x => keys.Contains(x.Row.LineKey) && TrainerSchedule.Learned(x.Row.Box)));
            })
            .OrderBy(f => f.Name, StringComparer.Ordinal)
            .ThenBy(f => f.Color, StringComparer.Ordinal)];
    }

    private async Task<Dictionary<string, TrainerProgress>> ProgressAsync(long userId, string color, IReadOnlyList<TrainerLine> lines, CancellationToken ct)
    {
        List<string> keys = [.. lines.Select(l => l.Key)];
        return await Context.TrainerProgress.AsNoTracking()
            .Where(p => p.UserId == userId && p.Color == color && keys.Contains(p.LineKey))
            .ToDictionaryAsync(p => p.LineKey, StringComparer.Ordinal, ct);
    }

    private static LineProgress With(TrainerLine line, TrainerProgress? row) =>
        new(line.Key, line.Name, line.Eco, line.Moves, row?.Box, row?.DueAt);
}
