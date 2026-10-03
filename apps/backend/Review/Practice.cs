using Chess.Backend.Data.ReadModels;
using Chess.Backend.Trainer;

namespace Chess.Backend.Review;

/// <summary>A practice position as the page shows it, with the game it came from.</summary>
internal sealed record PracticeItem(
    Guid GameId,
    int Ply,
    string Fen,
    string PlayedUci,
    string PlayedSan,
    IReadOnlyList<string> AcceptedUci,
    IReadOnlyList<string> BestLine,
    string Class,
    int Box,
    string White,
    string Black,
    DateTimeOffset? PlayedAt);

/// <summary>The position to practise now, or none for now with when the next is due (null: nothing to practise).</summary>
internal sealed record PracticeNext(PracticeItem? Item, DateTimeOffset? NextDueAt);

internal sealed record PracticeResult(int Box, DateTimeOffset DueAt, bool Learned);

internal sealed record PracticeSummary(int Positions, int Learned, int Due);

internal interface IPracticeService : IService
{
    Task<PracticeNext> NextAsync(long userId, CancellationToken ct);

    /// <summary>One answer: right moves the position up a box, wrong sends it back to box 0. Null for an unknown position.</summary>
    Task<PracticeResult?> RecordAsync(long userId, Guid gameId, int ply, bool correct, CancellationToken ct);

    Task<PracticeSummary> MineAsync(long userId, CancellationToken ct);
}

/// <summary>
/// A member's practice of their own mistakes (game-review D7) on the opening trainer's Leitner schedule: the due
/// position with the lowest box first, then the oldest due. Private to the member.
/// </summary>
internal sealed class PracticeService(ProjectDbContext context, ReadDbContext read, TimeProvider clock, ILogger<PracticeService> logger)
    : BaseService(context, logger), IPracticeService
{
    public async Task<PracticeNext> NextAsync(long userId, CancellationToken ct)
    {
        List<MistakeDrill> drills = await Context.MistakeDrills.AsNoTracking()
            .Where(d => d.UserId == userId)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync(ct);
        Dictionary<string, MistakeDrill> byKey = drills.ToDictionary(Key, StringComparer.Ordinal);
        NextLine next = TrainerSchedule.Next(
            [.. byKey.Keys],
            byKey.ToDictionary(p => p.Key, p => (p.Value.Box, p.Value.DueAt), StringComparer.Ordinal),
            clock.GetUtcNow());
        if (next.Line is null)
        {
            return new PracticeNext(null, next.NextDueAt);
        }

        MistakeDrill drill = byKey[next.Line];
        RmGame? game = await read.RmGames.AsNoTracking().SingleOrDefaultAsync(g => g.GameId == drill.GameId, ct);
        return new PracticeNext(
            new PracticeItem(
                drill.GameId,
                drill.Ply,
                drill.Fen,
                drill.PlayedUci,
                drill.PlayedSan,
                drill.AcceptedUci,
                drill.BestLine,
                drill.Class,
                drill.Box,
                game?.WhiteName ?? "?",
                game?.BlackName ?? "?",
                game?.EndedAt),
            null);
    }

    public async Task<PracticeResult?> RecordAsync(long userId, Guid gameId, int ply, bool correct, CancellationToken ct)
    {
        MistakeDrill? drill = await Context.MistakeDrills.SingleOrDefaultAsync(d => d.UserId == userId && d.GameId == gameId && d.Ply == ply, ct);
        if (drill is null)
        {
            return null;
        }

        DateTimeOffset now = clock.GetUtcNow();
        (drill.Box, drill.DueAt) = TrainerSchedule.After(drill.Box, correct, now);
        drill.UpdatedAt = now;
        await Context.SaveChangesAsync(ct);
        return new PracticeResult(drill.Box, drill.DueAt, TrainerSchedule.Learned(drill.Box));
    }

    public async Task<PracticeSummary> MineAsync(long userId, CancellationToken ct)
    {
        DateTimeOffset now = clock.GetUtcNow();
        List<(int Box, DateTimeOffset Due)> rows = [.. (await Context.MistakeDrills.AsNoTracking()
            .Where(d => d.UserId == userId)
            .Select(d => new { d.Box, d.DueAt })
            .ToListAsync(ct)).Select(d => (d.Box, d.DueAt))];
        return new PracticeSummary(rows.Count, rows.Count(r => TrainerSchedule.Learned(r.Box)), rows.Count(r => r.Due <= now));
    }

    private static string Key(MistakeDrill d) => $"{d.GameId:N}:{d.Ply}";
}
