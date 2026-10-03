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
    NotComplete,
}

internal interface IReviewService : IService
{
    /// <summary>The game's review, or null for an unknown game. A game still played has none (fair play).</summary>
    Task<ReviewView?> ReadAsync(Guid gameId, CancellationToken ct);

    /// <summary>Asks the engine for every position the review lacks: a player of a finished game, or an Admin.</summary>
    Task<(ReviewRefusal Refusal, ReviewView? View)> StartAsync(Guid gameId, long userId, bool admin, CancellationToken ct);

    /// <summary>Adds the player's own mistakes and blunders of a complete review to their practice (once each).</summary>
    Task<(ReviewRefusal Refusal, int Added)> AddPracticeAsync(Guid gameId, long userId, CancellationToken ct);
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

        return game.Status == RmGame.Ended ? await ViewAsync(game, await InputAsync(game, ct), ct) : ReviewView.Nothing;
    }

    public async Task<(ReviewRefusal Refusal, ReviewView? View)> StartAsync(Guid gameId, long userId, bool admin, CancellationToken ct)
    {
        RmGame? game = await read.RmGames.SingleOrDefaultAsync(g => g.GameId == gameId, ct);
        if (Refuse(game, userId, admin) is { } refusal)
        {
            return (refusal, null);
        }

        ReviewInput input = await InputAsync(game!, ct);
        DateTimeOffset now = clock.GetUtcNow();
        IReadOnlyList<ReviewPosition> missing = GameReviewer.Missing(input);
        List<string> keys = [.. missing.Select(p => p.Key)];
        int thinkMs = options.Value.ThinkMs;
        Dictionary<string, PositionEvaluation> pending = await Context.PositionEvaluations
            .Where(e => e.ThinkMs == thinkMs && keys.Contains(e.PositionKey))
            .ToDictionaryAsync(e => e.PositionKey, StringComparer.Ordinal, ct);

        List<AnalysisRequestMessage> ask = [];
        foreach (ReviewPosition position in missing)
        {
            if (pending.TryGetValue(position.Key, out PositionEvaluation? row))
            {
                if (now - row.RequestedAt < TimeSpan.FromSeconds(options.Value.RetryAfterSeconds))
                {
                    continue; // on its way
                }

                row.RequestedAt = now; // lost: ask again
            }
            else
            {
                Context.PositionEvaluations.Add(new PositionEvaluation { PositionKey = position.Key, ThinkMs = thinkMs, Status = PositionEvaluation.Requested, RequestedAt = now });
            }

            ask.Add(new AnalysisRequestMessage(position.Key, position.Fen, thinkMs, analysis.Value.Lines, now));
        }

        if (await Context.GameReviews.SingleOrDefaultAsync(r => r.GameId == gameId, ct) is null)
        {
            Context.GameReviews.Add(new GameReview { GameId = gameId, RequestedBy = userId, RequestedAt = now });
        }

        await Context.SaveChangesAsync(ct);
        if (ask.Count > 0)
        {
            await requests.RequestReviewAsync(ask, ct);
        }

        return (ReviewRefusal.None, await ViewAsync(game!, input, ct));
    }

    public async Task<(ReviewRefusal Refusal, int Added)> AddPracticeAsync(Guid gameId, long userId, CancellationToken ct)
    {
        RmGame? game = await read.RmGames.SingleOrDefaultAsync(g => g.GameId == gameId, ct);
        if (Refuse(game, userId, admin: false) is { } refusal)
        {
            return (refusal, 0);
        }

        ReviewInput input = await InputAsync(game!, ct);
        ReviewResult review = GameReviewer.Review(input);
        if (review.Evaluated < review.Positions)
        {
            return (ReviewRefusal.NotComplete, 0);
        }

        string color = game!.WhiteId == userId ? "white" : "black";
        HashSet<int> known = [.. await Context.MistakeDrills
            .Where(d => d.UserId == userId && d.GameId == gameId)
            .Select(d => d.Ply)
            .ToListAsync(ct)];
        DateTimeOffset now = clock.GetUtcNow();
        int added = 0;
        foreach (PracticePosition position in GameReviewer.Practice(input, color).Where(p => !known.Contains(p.Ply)))
        {
            Context.MistakeDrills.Add(new MistakeDrill
            {
                UserId = userId,
                GameId = gameId,
                Ply = position.Ply,
                Fen = position.Fen,
                PlayedUci = position.PlayedUci,
                PlayedSan = position.PlayedSan,
                AcceptedUci = [.. position.AcceptedUci],
                BestLine = [.. position.BestLine],
                Class = position.Class,
                Box = 0,
                DueAt = now,
                CreatedAt = now,
                UpdatedAt = now,
            });
            added++;
        }

        await Context.SaveChangesAsync(ct);
        return (ReviewRefusal.None, added);
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
        ReviewResult review = GameReviewer.Review(input);
        string status = review.Evaluated == review.Positions ? ReviewView.Complete
            : await Context.GameReviews.AnyAsync(r => r.GameId == game.GameId, ct) ? ReviewView.Running
            : ReviewView.None;
        return status == ReviewView.None
            ? ReviewView.Nothing with { Positions = review.Positions, Evaluated = review.Evaluated }
            : new ReviewView(status, review.Evaluated, review.Positions, review.Moves, review.White, review.Black, review.BookExit);
    }

    private async Task<ReviewInput> InputAsync(RmGame game, CancellationToken ct)
    {
        List<RmMove> rows = await read.RmMoves.Where(m => m.GameId == game.GameId).OrderBy(m => m.Ply).ToListAsync(ct);
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
