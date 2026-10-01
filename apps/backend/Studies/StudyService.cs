using System.Globalization;
using System.Text.Json;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Games;

namespace Chess.Backend.Studies;

/// <summary>A study as the client sends it on create or import: UCI moves, which <see cref="StudyTree"/> completes.</summary>
internal sealed record StudyInput(
    string Title,
    string? StartFen,
    IReadOnlyList<StudyMoveInput>? Tree,
    string? White = null,
    string? Black = null,
    string? Result = null,
    string? Date = null);

/// <summary>A study as the API answers it; <see cref="Mine"/> tells the page whether it may edit.</summary>
internal sealed record StudyView(
    Guid Id,
    long OwnerId,
    string OwnerName,
    string Title,
    string StartFen,
    IReadOnlyList<StudyMove> Tree,
    string? White,
    string? Black,
    string? Result,
    string? Date,
    bool Shared,
    long Version,
    bool Mine,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

/// <summary>A row of "my studies".</summary>
internal sealed record StudyListItem(Guid Id, string Title, string? White, string? Black, bool Shared, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

/// <summary>What an import made: the studies created, and the games refused (by their index in the request).</summary>
internal sealed record ImportResult(IReadOnlyList<StudyListItem> Created, IReadOnlyList<ImportRefusal> Refused);

internal sealed record ImportRefusal(int Index, string Error);

/// <summary>A study operation's answer: a value, or why not (404 hides a private study that is not yours, studies D4).</summary>
internal sealed record StudyOutcome<T>(T? Value, int Status, string? Error = null)
{
    public static StudyOutcome<T> Ok(T value) => new(value, StatusCodes.Status200OK);

    public static StudyOutcome<T> NotFound() => new(default, StatusCodes.Status404NotFound, "No such study.");

    public static StudyOutcome<T> Invalid(string error) => new(default, StatusCodes.Status400BadRequest, error);

    public static StudyOutcome<T> Conflict(string error) => new(default, StatusCodes.Status409Conflict, error);
}

internal interface IStudyService : IService
{
    Task<StudyOutcome<ImportResult>> CreateAsync(long ownerId, IReadOnlyList<StudyInput> studies, CancellationToken ct);

    Task<CursorPage<StudyListItem>> MineAsync(long ownerId, (DateTimeOffset At, Guid Id)? after, int limit, CancellationToken ct);

    Task<StudyOutcome<StudyView>> GetAsync(Guid id, long userId, CancellationToken ct);

    Task<StudyOutcome<StudyView>> UpdateAsync(Guid id, long userId, string title, IReadOnlyList<StudyMoveInput>? tree, long version, CancellationToken ct);

    Task<StudyOutcome<StudyView>> ShareAsync(Guid id, long userId, bool shared, CancellationToken ct);

    Task<bool> DeleteAsync(Guid id, long userId, CancellationToken ct);

    Task<StudyOutcome<string>> PgnAsync(Guid id, long userId, CancellationToken ct);

    Task<StudyOutcome<StudyView>> FromGameAsync(Guid gameId, long userId, CancellationToken ct);
}

/// <summary>
/// Studies on the primary (studies D1): the owner's own data, so reads are read-your-write. Every tree goes through
/// <see cref="StudyTree"/> before it is stored (D2); a study that is not yours and not shared does not exist for you (D4).
/// </summary>
internal sealed class StudyService(ProjectDbContext context, ILogger<StudyService> logger) : BaseService(context, logger), IStudyService
{
    public const int MaxImport = 20;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<StudyOutcome<ImportResult>> CreateAsync(long ownerId, IReadOnlyList<StudyInput> studies, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(studies);
        if (studies.Count is 0 or > MaxImport)
        {
            return StudyOutcome<ImportResult>.Invalid($"Send 1 to {MaxImport} studies at a time.");
        }

        List<Study> created = [];
        List<ImportRefusal> refused = [];
        for (int i = 0; i < studies.Count; i++)
        {
            StudyInput input = studies[i];
            string startFen = string.IsNullOrWhiteSpace(input.StartFen) ? ChessRules.StartFen : input.StartFen;
            (IReadOnlyList<StudyMove>? tree, StudyTreeError? error) = StudyTree.Validate(startFen, input.Tree);
            if (error is not null || string.IsNullOrWhiteSpace(input.Title))
            {
                refused.Add(new ImportRefusal(i, error?.Message ?? "A study needs a title."));
                continue;
            }

            Study study = new()
            {
                Id = Guid.NewGuid(), // v4: the link to a shared study is the secret (D1)
                OwnerId = ownerId,
                Title = Clip(input.Title.Trim(), 200)!,
                StartFen = startFen,
                Tree = JsonSerializer.Serialize(tree, Json),
                White = Clip(input.White, 255),
                Black = Clip(input.Black, 255),
                Result = PgnResults.IsDecided(input.Result) || input.Result == PgnResults.None ? input.Result : null,
                Date = Clip(input.Date, 10),
            };
            Context.Studies.Add(study);
            created.Add(study);
        }

        await Context.SaveChangesAsync(ct);
        return StudyOutcome<ImportResult>.Ok(new ImportResult(created.ConvertAll(ToListItem), refused));
    }

    public async Task<CursorPage<StudyListItem>> MineAsync(long ownerId, (DateTimeOffset At, Guid Id)? after, int limit, CancellationToken ct)
    {
        List<Study> rows = await Context.Studies.AsNoTracking()
            .Where(s => s.OwnerId == ownerId)
            .NewestFirst(s => s.CreatedAt, s => s.Id, after, limit)
            .ToListAsync(ct);
        return Keyset.ToPage(rows.ConvertAll(ToListItem), limit, s => new KeysetCursor(s.CreatedAt, s.Id.ToString()));
    }

    public async Task<StudyOutcome<StudyView>> GetAsync(Guid id, long userId, CancellationToken ct)
    {
        Study? study = await Context.Studies.AsNoTracking().SingleOrDefaultAsync(s => s.Id == id, ct);
        return study is not null && (study.OwnerId == userId || study.Shared)
            ? StudyOutcome<StudyView>.Ok(await ViewAsync(study, userId, ct))
            : StudyOutcome<StudyView>.NotFound();
    }

    public async Task<StudyOutcome<StudyView>> UpdateAsync(Guid id, long userId, string title, IReadOnlyList<StudyMoveInput>? tree, long version, CancellationToken ct)
    {
        Study? study = await OwnedAsync(id, userId, ct);
        if (study is null)
        {
            return StudyOutcome<StudyView>.NotFound();
        }

        if (study.Version != version)
        {
            return StudyOutcome<StudyView>.Conflict("The study was saved elsewhere since you opened it; reload it.");
        }

        (IReadOnlyList<StudyMove>? completed, StudyTreeError? error) = StudyTree.Validate(study.StartFen, tree);
        if (error is not null)
        {
            return StudyOutcome<StudyView>.Invalid(error.Message);
        }

        if (string.IsNullOrWhiteSpace(title))
        {
            return StudyOutcome<StudyView>.Invalid("A study needs a title.");
        }

        study.Title = Clip(title.Trim(), 200)!;
        study.Tree = JsonSerializer.Serialize(completed, Json);
        return await SaveAsync(study, userId, ct);
    }

    public async Task<StudyOutcome<StudyView>> ShareAsync(Guid id, long userId, bool shared, CancellationToken ct)
    {
        Study? study = await OwnedAsync(id, userId, ct);
        if (study is null)
        {
            return StudyOutcome<StudyView>.NotFound();
        }

        study.Shared = shared;
        return await SaveAsync(study, userId, ct);
    }

    public async Task<bool> DeleteAsync(Guid id, long userId, CancellationToken ct)
    {
        Study? study = await OwnedAsync(id, userId, ct);
        if (study is null)
        {
            return false;
        }

        Context.Studies.Remove(study);
        await Context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<StudyOutcome<string>> PgnAsync(Guid id, long userId, CancellationToken ct)
    {
        Study? study = await Context.Studies.AsNoTracking().SingleOrDefaultAsync(s => s.Id == id, ct);
        return study is not null && (study.OwnerId == userId || study.Shared)
            ? StudyOutcome<string>.Ok(StudyPgn.Build(study.Title, new StudyHeaders(study.White, study.Black, study.Result, study.Date), study.StartFen, TreeOf(study)))
            : StudyOutcome<string>.NotFound();
    }

    public async Task<StudyOutcome<StudyView>> FromGameAsync(Guid gameId, long userId, CancellationToken ct)
    {
        RmGame? game = await Context.RmGames.AsNoTracking().SingleOrDefaultAsync(g => g.GameId == gameId, ct);
        if (game is null || game.Status != RmGame.Ended)
        {
            return StudyOutcome<StudyView>.NotFound();
        }

        List<string> ucis = await Context.RmMoves.AsNoTracking()
            .Where(m => m.GameId == gameId)
            .OrderBy(m => m.Ply)
            .Select(m => m.Uci)
            .ToListAsync(ct);
        StudyMoveInput? line = null;
        for (int i = ucis.Count - 1; i >= 0; i--)
        {
            line = new StudyMoveInput(ucis[i], line is null ? [] : [line]);
        }

        string date = game.CreatedAt.ToString("yyyy.MM.dd", CultureInfo.InvariantCulture);
        StudyInput input = new($"{game.WhiteName} – {game.BlackName}, {date}", null, line is null ? [] : [line], game.WhiteName, game.BlackName, game.Result, date);
        StudyOutcome<ImportResult> created = await CreateAsync(userId, [input], ct);
        return created.Value is { Created: [StudyListItem made] }
            ? await GetAsync(made.Id, userId, ct)
            : StudyOutcome<StudyView>.Invalid(created.Value?.Refused is [ImportRefusal first, ..] ? first.Error : "The game could not become a study.");
    }

    private Task<Study?> OwnedAsync(Guid id, long userId, CancellationToken ct) =>
        Context.Studies.SingleOrDefaultAsync(s => s.Id == id && s.OwnerId == userId, ct);

    private async Task<StudyOutcome<StudyView>> SaveAsync(Study study, long userId, CancellationToken ct)
    {
        try
        {
            await Context.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return StudyOutcome<StudyView>.Conflict("The study was saved elsewhere since you opened it; reload it.");
        }

        return StudyOutcome<StudyView>.Ok(await ViewAsync(study, userId, ct));
    }

    private async Task<StudyView> ViewAsync(Study study, long userId, CancellationToken ct)
    {
        string? owner = await Context.Users.AsNoTracking().Where(u => u.Id == study.OwnerId).Select(u => u.Username).SingleOrDefaultAsync(ct);
        return new StudyView(
            study.Id, study.OwnerId, string.IsNullOrEmpty(owner) ? string.Create(CultureInfo.InvariantCulture, $"Player {study.OwnerId}") : owner,
            study.Title, study.StartFen, TreeOf(study), study.White, study.Black, study.Result, study.Date, study.Shared, study.Version,
            study.OwnerId == userId, study.CreatedAt, study.UpdatedAt);
    }

    private static List<StudyMove> TreeOf(Study study) => JsonSerializer.Deserialize<List<StudyMove>>(study.Tree, Json) ?? [];

    private static StudyListItem ToListItem(Study s) => new(s.Id, s.Title, s.White, s.Black, s.Shared, s.CreatedAt, s.UpdatedAt);

    private static string? Clip(string? value, int max) => value is null ? null : value.Length > max ? value[..max] : value;
}
