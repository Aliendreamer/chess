using Chess.Backend.Analysis;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Extensions;
using Chess.Backend.Games;
using Microsoft.Extensions.Options;

namespace Chess.Backend.Review;

/// <summary>Section <c>Review</c> (game-review): the think per position and when a lost request is asked again.</summary>
internal sealed class ReviewOptions : ISettings
{
    public const string SectionName = "Review";

    /// <summary>
    /// The engine's time per position. Kept apart from the analysis board's think times, so a review never makes a
    /// member's quick evaluation wait for it; any longer evaluation of a position (the board's) also serves the review.
    /// </summary>
    public int ThinkMs { get; set; } = 800;

    /// <summary>A position asked for this long ago and still unanswered counts as lost: asking again re-sends it.</summary>
    public int RetryAfterSeconds { get; set; } = 900;

    public void Validate()
    {
        if (ThinkMs is <= 0 or > 60_000 || RetryAfterSeconds <= 0)
        {
            throw new InvalidOperationException("Review:ThinkMs must be 1–60000 and Review:RetryAfterSeconds positive.");
        }
    }
}

/// <summary>
/// A game's review as the API answers it: <c>none</c> (never asked, or the game is still played — then nothing else is
/// given), <c>running</c> or <c>complete</c>, with what is known so far.
/// </summary>
internal sealed record ReviewView(
    string Status,
    int Evaluated,
    int Positions,
    IReadOnlyList<ReviewedMove> Moves,
    ReviewCounts White,
    ReviewCounts Black,
    BookExit? BookExit)
{
    public const string None = "none";
    public const string Running = "running";
    public const string Complete = "complete";

    public static readonly ReviewView Nothing = new(None, 0, 0, [], new(0, 0, 0), new(0, 0, 0), null);
}

internal enum ReviewRefusal
{
    None,
    NotFound,
    InPlay,
    NotPlayer,
}

internal interface IReviewService : IService
{
    /// <summary>The game's review, or null for an unknown game. A game still played has none (fair play).</summary>
    Task<ReviewView?> ReadAsync(Guid gameId, CancellationToken ct);

    /// <summary>Asks the engine for every position the review lacks: a player of a finished game, or an Admin.</summary>
    Task<(ReviewRefusal Refusal, ReviewView? View)> StartAsync(Guid gameId, long userId, bool admin, CancellationToken ct);

    /// <summary>
    /// The automatic review of a game that ended (training D2), from the primary's read model: started as a player's
    /// button would, requested by the game's human player; false when the game does not qualify (aborted, fewer than 2
    /// moves). Throws while the read model has not reached <paramref name="endedSeq"/> yet, so the consumer retries.
    /// </summary>
    Task<bool> StartAutomaticAsync(Guid gameId, long endedSeq, CancellationToken ct);

    /// <summary>
    /// The player's own mistakes and blunders of the game's complete review (training D2); null while the review is not
    /// complete — then the positions lost on the way are asked for again.
    /// </summary>
    Task<IReadOnlyList<PracticePosition>?> MistakesAsync(Guid gameId, long userId, CancellationToken ct);
}

/// <summary>
/// The review queue (game-review D2): a position is asked for on the review topic at <c>Review:ThinkMs</c> once, and again
/// only when its request has gone stale (lost). Shared by reviews and the training miner (training D3).
/// </summary>
internal static class ReviewQueue
{
    /// <summary>
    /// Stages a request row for each of <paramref name="missing"/> (positions with no finished evaluation) that is not on
    /// its way, and returns what to send once the caller has saved: send after <c>SaveChanges</c>, never before.
    /// </summary>
    public static async Task<List<AnalysisRequestMessage>> StageAsync(
        ProjectDbContext db,
        IReadOnlyList<ReviewPosition> missing,
        ReviewOptions review,
        AnalysisOptions analysis,
        DateTimeOffset now,
        CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(missing);
        ArgumentNullException.ThrowIfNull(review);
        ArgumentNullException.ThrowIfNull(analysis);
        List<string> keys = [.. missing.Select(p => p.Key)];
        int thinkMs = review.ThinkMs;
        Dictionary<string, PositionEvaluation> pending = await db.PositionEvaluations
            .Where(e => e.ThinkMs == thinkMs && keys.Contains(e.PositionKey))
            .ToDictionaryAsync(e => e.PositionKey, StringComparer.Ordinal, ct);

        List<AnalysisRequestMessage> ask = [];
        foreach (ReviewPosition position in missing.DistinctBy(p => p.Key, StringComparer.Ordinal))
        {
            if (pending.TryGetValue(position.Key, out PositionEvaluation? row))
            {
                if (row.Status == PositionEvaluation.Done || now - row.RequestedAt < TimeSpan.FromSeconds(review.RetryAfterSeconds))
                {
                    continue; // on its way
                }

                row.RequestedAt = now; // lost: ask again
            }
            else
            {
                db.PositionEvaluations.Add(new PositionEvaluation { PositionKey = position.Key, ThinkMs = thinkMs, Status = PositionEvaluation.Requested, RequestedAt = now });
            }

            ask.Add(new AnalysisRequestMessage(position.Key, position.Fen, thinkMs, analysis.Lines, now));
        }

        return ask;
    }
}

/// <summary>
/// The engine review of a finished game (game-review D1–D3, D7): the game from the replica, the evaluations from the
/// shared cache on the primary, the judging in <see cref="GameReviewer"/>.
/// </summary>
internal sealed class ReviewService(
    ProjectDbContext context,
    ReadDbContext read,
    IAnalysisRequests requests,
    IOptions<ReviewOptions> options,
    IOptions<AnalysisOptions> analysis,
    TimeProvider clock,
    ILogger<ReviewService> logger) : BaseService(context, logger), IReviewService
{
    public async Task<ReviewView?> ReadAsync(Guid gameId, CancellationToken ct)
    {
        RmGame? game = await read.RmGames.SingleOrDefaultAsync(g => g.GameId == gameId, ct);
        if (game is null)
        {
            return null;
        }

        return game.Status == RmGame.Ended ? await ViewAsync(game, await InputAsync(game, read.RmMoves, ct), ct) : ReviewView.Nothing;
    }

    public async Task<(ReviewRefusal Refusal, ReviewView? View)> StartAsync(Guid gameId, long userId, bool admin, CancellationToken ct)
    {
        RmGame? game = await read.RmGames.SingleOrDefaultAsync(g => g.GameId == gameId, ct);
        if (Refuse(game, userId, admin) is { } refusal)
        {
            return (refusal, null);
        }

        ReviewInput input = await InputAsync(game!, read.RmMoves, ct);
        await AskAsync(gameId, userId, input, ct);
        return (ReviewRefusal.None, await ViewAsync(game!, input, ct));
    }

    public async Task<bool> StartAutomaticAsync(Guid gameId, long endedSeq, CancellationToken ct)
    {
        // The primary, not the replica: GameProjection writes it on the same topic, so it is at most a moment behind.
        RmGame? game = await Context.RmGames.AsNoTracking().SingleOrDefaultAsync(g => g.GameId == gameId, ct);
        if (game is null || game.LastSeq < endedSeq)
        {
            throw new InvalidOperationException($"Game {gameId:N} has not reached its end in the read model yet; trying again.");
        }

        if (game.Status != RmGame.Ended || EndReasons.Parse(game.Reason) == EndReason.Aborted || game.Ply < 2)
        {
            return false;
        }

        long player = game.WhiteId > 0 ? game.WhiteId : game.BlackId; // engine players have negative ids
        await AskAsync(gameId, player, await InputAsync(game, Context.RmMoves.AsNoTracking(), ct), ct);
        return true;
    }

    public async Task<IReadOnlyList<PracticePosition>?> MistakesAsync(Guid gameId, long userId, CancellationToken ct)
    {
        RmGame? game = await read.RmGames.AsNoTracking().SingleOrDefaultAsync(g => g.GameId == gameId, ct);
        if (Refuse(game, userId, admin: false) is not null)
        {
            return [];
        }

        ReviewInput input = await InputAsync(game!, read.RmMoves, ct);
        ReviewResult review = GameReviewer.Review(input);
        if (review.Evaluated < review.Positions)
        {
            await AskAsync(gameId, userId, input, ct); // re-asks only what was lost on the way
            return null;
        }

        return GameReviewer.Practice(input, game!.WhiteId == userId ? SideNames.White : SideNames.Black);
    }

    /// <summary>Asks for the positions the review lacks and records that the review was asked for.</summary>
    private async Task AskAsync(Guid gameId, long userId, ReviewInput input, CancellationToken ct)
    {
        DateTimeOffset now = clock.GetUtcNow();
        List<AnalysisRequestMessage> ask = await ReviewQueue.StageAsync(Context, GameReviewer.Missing(input), options.Value, analysis.Value, now, ct);
        if (await Context.GameReviews.SingleOrDefaultAsync(r => r.GameId == gameId, ct) is null)
        {
            Context.GameReviews.Add(new GameReview { GameId = gameId, RequestedBy = userId, RequestedAt = now });
        }

        await Context.SaveChangesAsync(ct);
        if (ask.Count > 0)
        {
            await requests.RequestReviewAsync(ask, ct);
        }
    }

    /// <summary>Who may ask: a player of a finished game (or an Admin, for any finished game).</summary>
    private static ReviewRefusal? Refuse(RmGame? game, long userId, bool admin) => game switch
    {
        null => ReviewRefusal.NotFound,
        { Status: not RmGame.Ended } => ReviewRefusal.InPlay,
        _ when !admin && game.WhiteId != userId && game.BlackId != userId => ReviewRefusal.NotPlayer,
        _ => null,
    };

    private async Task<ReviewView> ViewAsync(RmGame game, ReviewInput input, CancellationToken ct)
    {
        // Never asked for: none, even when every position happens to be in the cache (a review is the players' choice).
        if (!await Context.GameReviews.AnyAsync(r => r.GameId == game.GameId, ct))
        {
            return ReviewView.Nothing;
        }

        ReviewResult review = GameReviewer.Review(input);
        string status = review.Evaluated == review.Positions ? ReviewView.Complete : ReviewView.Running;
        return new ReviewView(status, review.Evaluated, review.Positions, review.Moves, review.White, review.Black, review.BookExit);
    }

    private async Task<ReviewInput> InputAsync(RmGame game, IQueryable<RmMove> source, CancellationToken ct)
    {
        List<RmMove> rows = await source.Where(m => m.GameId == game.GameId).OrderBy(m => m.Ply).ToListAsync(ct);
        List<ReviewMove> moves = rows.ConvertAll(m => new ReviewMove(m.Ply, m.Uci, m.San, m.FenAfter));
        List<string> keys = [.. moves.Select(m => PositionKey.Of(m.FenAfter)!).Append(PositionKey.Of(ChessRules.StartFen)!).Distinct(StringComparer.Ordinal)];

        int thinkMs = options.Value.ThinkMs;
        List<PositionEvaluation> done = await Context.PositionEvaluations.AsNoTracking()
            .Where(e => keys.Contains(e.PositionKey) && e.ThinkMs >= thinkMs && e.Status == PositionEvaluation.Done && e.Lines != null)
            .ToListAsync(ct);
        Dictionary<string, Evaluation> evaluations = done
            .GroupBy(e => e.PositionKey, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => AnalysisService.ToEvaluation(g.MaxBy(e => e.ThinkMs)!), StringComparer.Ordinal);
        Dictionary<string, OpeningName> openings = await read.Openings
            .Where(o => keys.Contains(o.PositionKey))
            .ToDictionaryAsync(o => o.PositionKey, o => new OpeningName(o.Eco, o.Name), StringComparer.Ordinal, ct);
        return new ReviewInput(moves, game.Result, game.Reason, evaluations, openings);
    }
}
