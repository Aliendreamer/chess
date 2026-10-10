using System.Globalization;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Games;
using Chess.Backend.Library;
using Chess.Backend.Review;
using Chess.Backend.Trainer;

namespace Chess.Backend.Training;

/// <summary>The two pools a session trains from (training D4).</summary>
internal static class TrainingModes
{
    /// <summary>The member's own mistakes (<c>mistake_drills</c>).</summary>
    public const string Games = "games";

    /// <summary>Critical moments of master games (<c>training_positions</c>).</summary>
    public const string Library = "library";

    public static bool IsMode(string? mode) => mode is Games or Library;
}

/// <summary>The phase filter: any, or one of <see cref="TrainingPosition.Middlegame"/> / <see cref="TrainingPosition.Endgame"/>.</summary>
internal static class TrainingPhases
{
    public const string Any = "any";

    public static bool IsPhase(string? phase) => phase is Any or TrainingPosition.Middlegame or TrainingPosition.Endgame;
}

/// <summary>Which move a right answer was (training D4): the master's, one the engine accepts, both, or neither.</summary>
internal static class TrainingVerdicts
{
    public const string Master = "master";
    public const string Engine = "engine";
    public const string Both = "both";
    public const string None = "none";

    public static string Of(bool master, bool engine) => (master, engine) switch
    {
        (true, true) => Both,
        (true, false) => Master,
        (false, true) => Engine,
        _ => None,
    };
}

/// <summary>
/// A training position's id (training D4): <c>g:{gameId:N}:{ply}</c> for one of the member's mistakes,
/// <c>p:{positionId:N}</c> for a master-game position.
/// </summary>
internal static partial class TrainingIds
{
    /// <summary>The most ids a session may exclude in one request.</summary>
    public const int MaxExcluded = 100;

    public static string Game(Guid gameId, int ply) => string.Create(CultureInfo.InvariantCulture, $"g:{gameId:N}:{ply}");

    public static string Position(Guid positionId) => $"p:{positionId:N}";

    public static bool TryGame(string? id, out Guid gameId, out int ply)
    {
        gameId = Guid.Empty;
        ply = 0;
        Match m = GamePattern().Match(id ?? string.Empty);
        return m.Success
            && Guid.TryParseExact(m.Groups[1].Value, "N", out gameId)
            && int.TryParse(m.Groups[2].Value, NumberStyles.None, CultureInfo.InvariantCulture, out ply)
            && ply >= 1;
    }

    public static bool TryPosition(string? id, out Guid positionId)
    {
        positionId = Guid.Empty;
        Match m = PositionPattern().Match(id ?? string.Empty);
        return m.Success && Guid.TryParseExact(m.Groups[1].Value, "N", out positionId);
    }

    /// <summary>Whether <paramref name="id"/> is an id of <paramref name="mode"/>.</summary>
    public static bool IsValid(string? mode, string? id) => mode switch
    {
        TrainingModes.Games => TryGame(id, out _, out _),
        TrainingModes.Library => TryPosition(id, out _),
        _ => false,
    };

    [GeneratedRegex("^g:([0-9a-f]{32}):([0-9]{1,4})$")]
    private static partial Regex GamePattern();

    [GeneratedRegex("^p:([0-9a-f]{32})$")]
    private static partial Regex PositionPattern();
}

/// <summary>A position to answer: its id, the pool it is from, the board and the member's box (null: never answered).</summary>
internal sealed record TrainingItem(string Id, string Mode, string Fen, string SideToMove, int? Box);

/// <summary>The next position of a session (null: nothing left) and how many positions match.</summary>
internal sealed record TrainingNext(TrainingItem? Item, int Pool);

/// <summary>Where a position came from: <c>{ kind: 'library', … }</c> or <c>{ kind: 'game', … }</c>.</summary>
[JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]
[JsonDerivedType(typeof(LibraryTrainingSource), "library")]
[JsonDerivedType(typeof(GameTrainingSource), "game")]
internal abstract record TrainingSource;

/// <summary>A master game of the library; <see cref="Ply"/> is the position's (the master's move is the next).</summary>
internal sealed record LibraryTrainingSource(Guid LibraryGameId, string White, string Black, string? Event, int? Year, int Ply) : TrainingSource;

/// <summary>One of the member's games; <see cref="Ply"/> is the mistake's.</summary>
internal sealed record GameTrainingSource(Guid GameId, int Ply, string Opponent) : TrainingSource;

/// <summary>The server's judgement of an answer and what it did to the member's box (training D4).</summary>
internal sealed record TrainingVerdict(
    bool Correct,
    string Verdict,
    string? MasterUci,
    string? PlayedUci,
    IReadOnlyList<string> AcceptedUci,
    IReadOnlyList<string> BestLine,
    TrainingSource Source,
    int Box,
    DateTimeOffset DueAt,
    bool Learned);

internal sealed record GamesTraining(int Positions, int Learned, int Due);

internal sealed record LibraryTraining(int Pool, int Seen, int Learned, int Due);

/// <summary>The member's training in numbers: their own mistakes, and the master positions.</summary>
internal sealed record TrainingSummary(GamesTraining Games, LibraryTraining Library);

/// <summary>The master-game filters (training D4); the games pool takes none.</summary>
internal sealed record TrainingFilter(string? Eco, string Phase, string? Player, int? From, int? To)
{
    public static readonly TrainingFilter None = new(null, TrainingPhases.Any, null, null, null);
}

/// <summary>A mistake's schedule, for picking the next one.</summary>
internal sealed record DrillState(string Id, int Box, DateTimeOffset DueAt, DateTimeOffset UpdatedAt);

/// <summary>The session order and the master-game filters (training D4), over plain values and queryables.</summary>
internal static partial class TrainingReads
{
    /// <summary>
    /// The member's mistakes: the due ones first (oldest due first), then the rest by box, oldest answered first; never
    /// an excluded one. Null when every one is excluded.
    /// </summary>
    public static string? NextDrill(IEnumerable<DrillState> drills, IReadOnlySet<string> exclude, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(drills);
        ArgumentNullException.ThrowIfNull(exclude);
        List<DrillState> open = [.. drills.Where(d => !exclude.Contains(d.Id))];
        DrillState? due = open.Where(d => d.DueAt <= now).OrderBy(d => d.DueAt).ThenBy(d => d.Id, StringComparer.Ordinal).FirstOrDefault();
        return (due ?? open.OrderBy(d => d.Box).ThenBy(d => d.UpdatedAt).ThenBy(d => d.Id, StringComparer.Ordinal).FirstOrDefault())?.Id;
    }

    /// <summary>
    /// <c>eco</c> is an ECO prefix (<c>B9</c>, <c>B90</c>) or else part of the opening's name; <c>player</c> part of White's
    /// or Black's name; <c>from</c>/<c>to</c> the game's year. Names use Postgres <c>ILIKE</c> (trigram indexes).
    /// </summary>
    public static IQueryable<TrainingPosition> Filter(IQueryable<TrainingPosition> positions, TrainingFilter filter)
    {
        ArgumentNullException.ThrowIfNull(positions);
        ArgumentNullException.ThrowIfNull(filter);
        if (filter.Eco is { } eco && !string.IsNullOrWhiteSpace(eco))
        {
            if (EcoPrefix().IsMatch(eco.Trim()))
            {
                string prefix = eco.Trim().ToUpperInvariant();
                positions = positions.Where(p => p.Eco != null && p.Eco.StartsWith(prefix));
            }
            else if (LibraryReads.Pattern(eco) is { } opening)
            {
                positions = positions.Where(p => p.OpeningName != null && EF.Functions.ILike(p.OpeningName, opening));
            }
        }

        if (filter.Phase is TrainingPosition.Middlegame or TrainingPosition.Endgame)
        {
            string phase = filter.Phase;
            positions = positions.Where(p => p.Phase == phase);
        }

        if (LibraryReads.Pattern(filter.Player) is { } player)
        {
            positions = positions.Where(p => EF.Functions.ILike(p.White, player) || EF.Functions.ILike(p.Black, player));
        }

        if (filter.From is { } from)
        {
            positions = positions.Where(p => p.Year >= from);
        }

        if (filter.To is { } to)
        {
            positions = positions.Where(p => p.Year <= to);
        }

        return positions;
    }

    [GeneratedRegex("^[A-Ea-e][0-9]{0,2}$")]
    private static partial Regex EcoPrefix();
}

internal interface ITrainingService : IService
{
    /// <summary>The next position of a session in <paramref name="mode"/>, never one of <paramref name="exclude"/>.</summary>
    Task<TrainingNext> NextAsync(long userId, string mode, TrainingFilter filter, IReadOnlyCollection<string> exclude, CancellationToken ct);

    /// <summary>Judges <paramref name="uci"/> and moves the position in the member's boxes; null when there is no such position.</summary>
    Task<TrainingVerdict?> AnswerAsync(long userId, string mode, string id, string uci, CancellationToken ct);

    Task<TrainingSummary> SummaryAsync(long userId, CancellationToken ct);

    /// <summary>
    /// Copies the member's mistakes of every complete review of their games not copied yet into <c>mistake_drills</c>
    /// (once per game, insert-if-missing) and marks the game synced (training D2). Returns how many mistakes were new.
    /// </summary>
    Task<int> SyncAsync(long userId, CancellationToken ct);
}

/// <summary>
/// Training sessions (training D2, D4): stateless — the page keeps the session and sends what it has shown — on the
/// primary (<c>mistake_drills</c>, <c>training_*</c>), with the member's games from the replica. Private to the member.
/// </summary>
internal sealed class TrainingService(
    ProjectDbContext context,
    ReadDbContext read,
    IReviewService reviews,
    TimeProvider clock,
    ILogger<TrainingService> logger) : BaseService(context, logger), ITrainingService
{
    public async Task<TrainingNext> NextAsync(long userId, string mode, TrainingFilter filter, IReadOnlyCollection<string> exclude, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(filter);
        ArgumentNullException.ThrowIfNull(exclude);
        return mode == TrainingModes.Games
            ? await NextMistakeAsync(userId, exclude, ct)
            : await NextPositionAsync(userId, filter, exclude, ct);
    }

    public async Task<TrainingVerdict?> AnswerAsync(long userId, string mode, string id, string uci, CancellationToken ct)
    {
        DateTimeOffset now = clock.GetUtcNow();
        if (mode == TrainingModes.Library && TrainingIds.TryPosition(id, out Guid positionId))
        {
            if (await Context.TrainingPositions.AsNoTracking().SingleOrDefaultAsync(p => p.Id == positionId, ct) is not { } position)
            {
                return null;
            }

            bool master = string.Equals(uci, position.MasterUci, StringComparison.Ordinal);
            bool engine = position.AcceptedUci.Contains(uci, StringComparer.Ordinal);
            TrainingProgress? row = await Context.TrainingProgress.SingleOrDefaultAsync(p => p.UserId == userId && p.PositionId == positionId, ct);
            (int box, DateTimeOffset due) = TrainerSchedule.After(row?.Box, master || engine, now);
            if (row is null)
            {
                row = new TrainingProgress { UserId = userId, PositionId = positionId };
                Context.TrainingProgress.Add(row);
            }

            row.Box = box;
            row.DueAt = due;
            row.UpdatedAt = now;
            await Context.SaveChangesAsync(ct);
            return new TrainingVerdict(
                master || engine,
                TrainingVerdicts.Of(master, engine),
                position.MasterUci,
                null,
                position.AcceptedUci,
                position.BestLine,
                new LibraryTrainingSource(position.LibraryGameId, position.White, position.Black, position.Event, position.Year, position.Ply),
                box,
                due,
                TrainerSchedule.Learned(box));
        }

        if (mode == TrainingModes.Games && TrainingIds.TryGame(id, out Guid gameId, out int ply))
        {
            if (await Context.MistakeDrills.SingleOrDefaultAsync(d => d.UserId == userId && d.GameId == gameId && d.Ply == ply, ct) is not { } drill)
            {
                return null;
            }

            bool engine = drill.AcceptedUci.Contains(uci, StringComparer.Ordinal);
            (drill.Box, drill.DueAt) = TrainerSchedule.After(drill.Box, engine, now);
            drill.UpdatedAt = now;
            await Context.SaveChangesAsync(ct);
            RmGame? game = await read.RmGames.AsNoTracking().SingleOrDefaultAsync(g => g.GameId == gameId, ct);
            string opponent = game is null ? "?" : game.WhiteId == userId ? game.BlackName : game.WhiteName;
            return new TrainingVerdict(
                engine,
                TrainingVerdicts.Of(false, engine),
                null,
                drill.PlayedUci,
                drill.AcceptedUci,
                drill.BestLine,
                new GameTrainingSource(gameId, ply, opponent),
                drill.Box,
                drill.DueAt,
                TrainerSchedule.Learned(drill.Box));
        }

        return null;
    }

    public async Task<TrainingSummary> SummaryAsync(long userId, CancellationToken ct)
    {
        await SyncAsync(userId, ct);
        DateTimeOffset now = clock.GetUtcNow();
        var drills = await Context.MistakeDrills.AsNoTracking().Where(d => d.UserId == userId).Select(d => new { d.Box, d.DueAt }).ToListAsync(ct);
        var seen = await Context.TrainingProgress.AsNoTracking().Where(p => p.UserId == userId).Select(p => new { p.Box, p.DueAt }).ToListAsync(ct);
        int pool = await Context.TrainingPositions.CountAsync(ct);
        return new TrainingSummary(
            new GamesTraining(drills.Count, drills.Count(d => TrainerSchedule.Learned(d.Box)), drills.Count(d => d.DueAt <= now)),
            new LibraryTraining(pool, seen.Count, seen.Count(p => TrainerSchedule.Learned(p.Box)), seen.Count(p => p.DueAt <= now)));
    }

    public async Task<int> SyncAsync(long userId, CancellationToken ct)
    {
        List<Guid> mine = await read.RmGames.AsNoTracking()
            .Where(g => (g.WhiteId == userId || g.BlackId == userId) && g.Status == RmGame.Ended)
            .Select(g => g.GameId)
            .ToListAsync(ct);
        if (mine.Count == 0)
        {
            return 0;
        }

        List<Guid> pending = await Context.GameReviews.AsNoTracking()
            .Where(r => mine.Contains(r.GameId) && !Context.TrainingSynced.Any(s => s.UserId == userId && s.GameId == r.GameId))
            .OrderBy(r => r.RequestedAt)
            .Select(r => r.GameId)
            .ToListAsync(ct);

        int added = 0;
        DateTimeOffset now = clock.GetUtcNow();
        foreach (Guid gameId in pending)
        {
            if (await reviews.MistakesAsync(gameId, userId, ct) is not { } mistakes)
            {
                continue; // not complete yet: next time
            }

            HashSet<int> known = [.. await Context.MistakeDrills
                .Where(d => d.UserId == userId && d.GameId == gameId)
                .Select(d => d.Ply)
                .ToListAsync(ct)];
            foreach (PracticePosition mistake in mistakes.Where(p => !known.Contains(p.Ply)))
            {
                Context.MistakeDrills.Add(new MistakeDrill
                {
                    UserId = userId,
                    GameId = gameId,
                    Ply = mistake.Ply,
                    Fen = mistake.Fen,
                    PlayedUci = mistake.PlayedUci,
                    PlayedSan = mistake.PlayedSan,
                    AcceptedUci = [.. mistake.AcceptedUci],
                    BestLine = [.. mistake.BestLine],
                    Class = mistake.Class,
                    Box = 0,
                    DueAt = now,
                    CreatedAt = now,
                    UpdatedAt = now,
                });
                added++;
            }

            Context.TrainingSynced.Add(new TrainingSynced { UserId = userId, GameId = gameId, SyncedAt = now });
            await Context.SaveChangesAsync(ct);
        }

        return added;
    }

    private async Task<TrainingNext> NextMistakeAsync(long userId, IReadOnlyCollection<string> exclude, CancellationToken ct)
    {
        await SyncAsync(userId, ct);
        List<MistakeDrill> drills = await Context.MistakeDrills.AsNoTracking().Where(d => d.UserId == userId).ToListAsync(ct);
        Dictionary<string, MistakeDrill> byId = drills.ToDictionary(d => TrainingIds.Game(d.GameId, d.Ply), StringComparer.Ordinal);
        string? next = TrainingReads.NextDrill(
            byId.Select(p => new DrillState(p.Key, p.Value.Box, p.Value.DueAt, p.Value.UpdatedAt)),
            exclude.ToHashSet(StringComparer.Ordinal),
            clock.GetUtcNow());
        if (next is null)
        {
            return new TrainingNext(null, drills.Count);
        }

        MistakeDrill drill = byId[next];
        return new TrainingNext(new TrainingItem(next, TrainingModes.Games, drill.Fen, Engine.EngineRequestConsumer.SideToMove(drill.Fen), drill.Box), drills.Count);
    }

    private async Task<TrainingNext> NextPositionAsync(long userId, TrainingFilter filter, IReadOnlyCollection<string> exclude, CancellationToken ct)
    {
        IQueryable<TrainingPosition> matching = TrainingReads.Filter(Context.TrainingPositions.AsNoTracking(), filter);
        int pool = await matching.CountAsync(ct);
        List<Guid> excluded = [.. exclude.Select(id => TrainingIds.TryPosition(id, out Guid p) ? p : Guid.Empty).Where(p => p != Guid.Empty)];
        IQueryable<TrainingPosition> open = matching.Where(p => !excluded.Contains(p.Id));
        DateTimeOffset now = clock.GetUtcNow();

        var due = await open
            .Join(
                Context.TrainingProgress.Where(t => t.UserId == userId && t.DueAt <= now),
                p => p.Id,
                t => t.PositionId,
                (p, t) => new { Position = p, t.Box, t.DueAt })
            .OrderBy(x => x.DueAt)
            .ThenBy(x => x.Position.Id)
            .FirstOrDefaultAsync(ct);
        if (due is not null)
        {
            return new TrainingNext(Item(due.Position, due.Box), pool);
        }

        // A new one in random order: the first id at or after a random one (ids are random), wrapping around.
        IQueryable<TrainingPosition> fresh = open.Where(p => !Context.TrainingProgress.Any(t => t.UserId == userId && t.PositionId == p.Id));
        Guid pivot = Guid.NewGuid();
        TrainingPosition? position = await fresh.Where(p => p.Id.CompareTo(pivot) >= 0).OrderBy(p => p.Id).FirstOrDefaultAsync(ct)
            ?? await fresh.OrderBy(p => p.Id).FirstOrDefaultAsync(ct);
        return new TrainingNext(position is null ? null : Item(position, null), pool);
    }

    private static TrainingItem Item(TrainingPosition position, int? box) =>
        new(TrainingIds.Position(position.Id), TrainingModes.Library, position.Fen, position.SideToMove, box);
}
