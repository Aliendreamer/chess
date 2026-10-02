namespace Chess.Backend.Library;

internal enum ImportStatus
{
    Imported,
    Duplicate,
    Refused,
}

/// <summary>What happened to one game of an import, by its place in the batch.</summary>
internal sealed record ImportItem(int Index, ImportStatus Status, string? Error = null, Guid? GameId = null);

internal interface ILibraryService : IService
{
    /// <summary>Imports a batch: legal new games are stored with their positions, in one transaction.</summary>
    Task<IReadOnlyList<ImportItem>> ImportAsync(ImportSource source, IReadOnlyList<ImportGame> games, CancellationToken ct);
}

/// <summary>
/// The library's writes (game-library D3): <see cref="LibraryImport"/> decides each game, this stores the new ones and
/// skips games already in the library — or twice in the same batch — by their dedupe key.
/// </summary>
internal sealed class LibraryService(ProjectDbContext context, TimeProvider clock, ILogger<LibraryService> logger)
    : BaseService(context, logger), ILibraryService
{
    /// <summary>The most games one import request may carry; the admin page sends files in batches of this size.</summary>
    public const int MaxBatch = 100;

    public async Task<IReadOnlyList<ImportItem>> ImportAsync(ImportSource source, IReadOnlyList<ImportGame> games, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(games);
        Dictionary<string, Opening> openings = await Context.Openings.AsNoTracking().ToDictionaryAsync(o => o.PositionKey, StringComparer.Ordinal, ct);
        DateTimeOffset now = clock.GetUtcNow();
        List<ImportOutcome> outcomes = [.. games.Select(g => LibraryImport.Prepare(g, source, openings, now))];

        List<string> keys = [.. outcomes.OfType<PreparedGame>().Select(p => p.Game.DedupeKey)];
        HashSet<string> known = [.. await Context.LibraryGames.Where(g => keys.Contains(g.DedupeKey)).Select(g => g.DedupeKey).ToListAsync(ct)];

        List<ImportItem> items = [];
        for (int i = 0; i < outcomes.Count; i++)
        {
            switch (outcomes[i])
            {
                case RefusedGame refused:
                    items.Add(new ImportItem(i, ImportStatus.Refused, refused.Error));
                    break;
                case PreparedGame prepared when !known.Add(prepared.Game.DedupeKey):
                    items.Add(new ImportItem(i, ImportStatus.Duplicate));
                    break;
                case PreparedGame prepared:
                    Context.LibraryGames.Add(prepared.Game);
                    Context.LibraryPositions.AddRange(prepared.Positions);
                    items.Add(new ImportItem(i, ImportStatus.Imported, GameId: prepared.Game.Id));
                    break;
            }
        }

        await Context.SaveChangesAsync(ct);
        return items;
    }
}
