using Akka.Event;
using Chess.Backend.Akka;
using Chess.Backend.Analysis;
using Chess.Backend.Extensions;
using Chess.Backend.Games;
using Chess.Backend.Review;

namespace Chess.Backend.Training;

/// <summary>Section <c>Training</c> (training D1, D3): what the miner looks at, how often, and what counts as critical.</summary>
internal sealed class TrainingOptions : ISettings
{
    public const string SectionName = "Training";

    /// <summary>Positions before this ply are never mined: the opening is the trainer's.</summary>
    public int MinPly { get; set; } = 20;

    /// <summary>The miner's round: judge what the engine answered, then top up.</summary>
    public int MineSeconds { get; set; } = 10;

    /// <summary>Winning chances (−1…1) the best move must gain over the second for the position to be critical.</summary>
    public double MinGap { get; set; } = 0.25;

    /// <summary>
    /// Candidates waiting for the engine at once. The miner shares the review queue, so this bounds how long a member's
    /// own review can wait behind it.
    /// </summary>
    public int InFlight { get; set; } = 20;

    /// <summary>At most this many positions of one library game are ever looked at.</summary>
    public int PerGame { get; set; } = 3;

    public void Validate()
    {
        if (MinPly is < 0 or > 1000 || MineSeconds <= 0 || InFlight <= 0 || PerGame <= 0)
        {
            throw new InvalidOperationException("Training:MinPly must be 0–1000, and Training:MineSeconds, Training:InFlight and Training:PerGame positive.");
        }

        if (MinGap is <= 0 or > 2)
        {
            throw new InvalidOperationException("Training:MinGap must be above 0 and at most 2.");
        }
    }
}

/// <summary>A position the engine found one move clearly best in (training D3).</summary>
internal sealed record CriticalMoment(IReadOnlyList<string> AcceptedUci, IReadOnlyList<string> BestLine, double Gap);

/// <summary>A library position the miner may pick: its key, game, ply and the move the game played there.</summary>
internal sealed record LibrarySpot(string PositionKey, Guid GameId, int Ply, string NextUci);

/// <summary>The miner's judging, pure (training D1, D3): critical or quiet, the phase, and which positions to look at next.</summary>
internal static class CriticalMoments
{
    /// <summary>A side's non-pawn, non-king material at or under this (Q9 R5 B3 N3) is an endgame.</summary>
    private const int EndgameMaterial = 13;

    /// <summary>
    /// Critical when the side to move has at least two legal moves, the engine gave two lines, and its best gains at least
    /// <paramref name="minGap"/> in winning chances over its second; null (quiet) otherwise.
    /// </summary>
    public static CriticalMoment? Judge(string fen, IReadOnlyList<EvaluationLine> lines, double minGap)
    {
        ArgumentNullException.ThrowIfNull(lines);
        if (ChessRules.ForStudy(fen) is not { } rules || rules.LegalMoveCount < 2)
        {
            return null;
        }

        List<EvaluationLine> scored = [.. lines.Where(l => l.Pv.Count > 0)];
        if (scored.Count < 2)
        {
            return null;
        }

        bool white = rules.SideToMove == Side.White;
        double gap = GameReviewer.ChancesFor(scored[0], white) - GameReviewer.ChancesFor(scored[1], white);
        return gap < minGap ? null : new CriticalMoment(GameReviewer.Accepted(scored, white), [.. scored[0].Pv], gap);
    }

    /// <summary>
    /// Endgame when both queens are off, or each side has at most 13 points of non-pawn, non-king material; otherwise
    /// middlegame. Read from the FEN's placement.
    /// </summary>
    public static string Phase(string fen)
    {
        ArgumentNullException.ThrowIfNull(fen);
        string placement = fen.Split(' ')[0];
        int white = 0, black = 0;
        bool queens = false;
        foreach (char c in placement)
        {
            int value = char.ToLowerInvariant(c) switch
            {
                'q' => 9,
                'r' => 5,
                'b' or 'n' => 3,
                _ => 0,
            };
            queens |= c is 'q' or 'Q';
            if (char.IsUpper(c))
            {
                white += value;
            }
            else
            {
                black += value;
            }
        }

        return !queens || (white <= EndgameMaterial && black <= EndgameMaterial) ? TrainingPosition.Endgame : TrainingPosition.Middlegame;
    }

    /// <summary>
    /// At most one position per game per round (the per-game cap is the query's), at most <paramref name="max"/>, never a
    /// position twice: a random one of each game's <paramref name="spots"/>, games in random order.
    /// </summary>
    public static IReadOnlyList<LibrarySpot> Pick(IEnumerable<LibrarySpot> spots, int max, Random random)
    {
        ArgumentNullException.ThrowIfNull(spots);
        ArgumentNullException.ThrowIfNull(random);
        HashSet<string> keys = new(StringComparer.Ordinal);
        List<LibrarySpot> picked = [];
        foreach (IGrouping<Guid, LibrarySpot> game in spots.GroupBy(s => s.GameId).OrderBy(_ => random.Next()))
        {
            if (picked.Count >= max)
            {
                break;
            }

            LibrarySpot? spot = game.Where(s => !keys.Contains(s.PositionKey)).OrderBy(_ => random.Next()).FirstOrDefault();
            if (spot is not null)
            {
                keys.Add(spot.PositionKey);
                picked.Add(spot);
            }
        }

        return picked;
    }

    /// <summary>The position after the first <paramref name="ply"/> moves of a library game; null when they do not play.</summary>
    public static string? FenAt(IReadOnlyList<string> moves, int ply)
    {
        ArgumentNullException.ThrowIfNull(moves);
        if (ply > moves.Count || ChessRules.ForStudy(ChessRules.StartFen) is not { } rules)
        {
            return null;
        }

        foreach (string uci in moves.Take(ply))
        {
            if (rules.TryApply(uci) is not MoveApplied)
            {
                return null;
            }
        }

        return rules.Fen;
    }
}

/// <summary>
/// One round of the miner (training D3) on the primary: judge the waiting candidates the engine has answered, ask again
/// for those lost on the way, then top up to <see cref="TrainingOptions.InFlight"/> from the library. Evaluations go
/// through the review queue (<see cref="ReviewQueue"/>), so one already cached costs nothing.
/// </summary>
internal sealed class TrainingMineRound(
    ProjectDbContext db,
    IAnalysisRequests requests,
    TrainingOptions training,
    ReviewOptions review,
    AnalysisOptions analysis,
    TimeProvider clock,
    Func<IQueryable<LibraryGame>, IQueryable<LibraryGame>>? order = null)
{
    /// <summary>Games in random order (Postgres <c>random()</c>); a test passes a plain order instead.</summary>
    private readonly Func<IQueryable<LibraryGame>, IQueryable<LibraryGame>> _order = order ?? (q => q.OrderBy(_ => EF.Functions.Random()));

    public async Task<MineOutcome> RunAsync(CancellationToken ct)
    {
        (int critical, int quiet) = await JudgeAsync(ct);
        int added = await TopUpAsync(ct);
        return new MineOutcome(critical, quiet, added);
    }

    /// <summary>Judges each waiting candidate whose evaluation is there; re-asks those waiting longer than four retry periods.</summary>
    public async Task<(int Critical, int Quiet)> JudgeAsync(CancellationToken ct)
    {
        List<TrainingCandidate> waiting = await db.TrainingCandidates.Where(c => c.Status == TrainingCandidate.Waiting).ToListAsync(ct);
        if (waiting.Count == 0)
        {
            return (0, 0);
        }

        DateTimeOffset now = clock.GetUtcNow();
        Dictionary<string, Evaluation> evaluations = await EvaluationsAsync([.. waiting.Select(c => c.PositionKey)], ct);
        List<Guid> gameIds = [.. waiting.Where(c => evaluations.ContainsKey(c.PositionKey)).Select(c => c.LibraryGameId).Distinct()];
        Dictionary<Guid, LibraryGame> games = await db.LibraryGames.AsNoTracking()
            .Where(g => gameIds.Contains(g.Id))
            .ToDictionaryAsync(g => g.Id, ct);

        int critical = 0, quiet = 0;
        List<ReviewPosition> lost = [];
        TimeSpan staleAfter = TimeSpan.FromSeconds(review.RetryAfterSeconds * 4L);
        foreach (TrainingCandidate candidate in waiting)
        {
            if (!evaluations.TryGetValue(candidate.PositionKey, out Evaluation? evaluation))
            {
                if (now - candidate.RequestedAt > staleAfter)
                {
                    lost.Add(new ReviewPosition(candidate.PositionKey, candidate.Fen));
                    candidate.RequestedAt = now;
                }

                continue;
            }

            candidate.JudgedAt = now;
            if (CriticalMoments.Judge(candidate.Fen, evaluation.Lines, training.MinGap) is { } moment
                && games.TryGetValue(candidate.LibraryGameId, out LibraryGame? game))
            {
                candidate.Status = TrainingCandidate.Critical;
                db.TrainingPositions.Add(Position(candidate, moment, game, now));
                critical++;
            }
            else
            {
                candidate.Status = TrainingCandidate.Quiet;
                quiet++;
            }
        }

        await SaveAndAskAsync(lost, now, ct);
        return (critical, quiet);
    }

    /// <summary>
    /// Adds candidates up to <see cref="TrainingOptions.InFlight"/> waiting: random library games past
    /// <see cref="TrainingOptions.MinPly"/> with fewer than <see cref="TrainingOptions.PerGame"/> looked at, one unvisited
    /// position each. Returns how many were added.
    /// </summary>
    public async Task<int> TopUpAsync(CancellationToken ct)
    {
        int need = training.InFlight - await db.TrainingCandidates.CountAsync(c => c.Status == TrainingCandidate.Waiting, ct);
        if (need <= 0)
        {
            return 0;
        }

        int minPly = training.MinPly;
        int perGame = training.PerGame;
        List<Guid> gameIds = await _order(db.LibraryGames.AsNoTracking()
                .Where(g => g.Ply > minPly && db.TrainingCandidates.Count(c => c.LibraryGameId == g.Id) < perGame))
            .Take(need)
            .Select(g => g.Id)
            .ToListAsync(ct);
        if (gameIds.Count == 0)
        {
            return 0;
        }

        List<LibrarySpot> spots = await db.LibraryPositions.AsNoTracking()
            .Where(p => gameIds.Contains(p.GameId) && p.Ply >= minPly && p.NextUci != null
                && !db.TrainingCandidates.Any(c => c.PositionKey == p.PositionKey))
            .Select(p => new LibrarySpot(p.PositionKey, p.GameId, p.Ply, p.NextUci!))
            .ToListAsync(ct);
        IReadOnlyList<LibrarySpot> picked = CriticalMoments.Pick(spots, need, Random.Shared);
        List<Guid> pickedGames = [.. picked.Select(s => s.GameId).Distinct()];
        Dictionary<Guid, List<string>> moves = await db.LibraryGames.AsNoTracking()
            .Where(g => pickedGames.Contains(g.Id))
            .ToDictionaryAsync(g => g.Id, g => g.MovesUci, ct);

        DateTimeOffset now = clock.GetUtcNow();
        List<ReviewPosition> positions = [];
        foreach (LibrarySpot spot in picked)
        {
            if (CriticalMoments.FenAt(moves[spot.GameId], spot.Ply) is not { } fen)
            {
                continue;
            }

            db.TrainingCandidates.Add(new TrainingCandidate
            {
                PositionKey = spot.PositionKey,
                Fen = fen,
                LibraryGameId = spot.GameId,
                Ply = spot.Ply,
                MasterUci = spot.NextUci,
                Status = TrainingCandidate.Waiting,
                RequestedAt = now,
            });
            positions.Add(new ReviewPosition(spot.PositionKey, fen));
        }

        Dictionary<string, Evaluation> known = await EvaluationsAsync([.. positions.Select(p => p.Key)], ct);
        await SaveAndAskAsync([.. positions.Where(p => !known.ContainsKey(p.Key))], now, ct);
        return positions.Count;
    }

    private static TrainingPosition Position(TrainingCandidate candidate, CriticalMoment moment, LibraryGame game, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        PositionKey = candidate.PositionKey,
        Fen = candidate.Fen,
        SideToMove = Engine.EngineRequestConsumer.SideToMove(candidate.Fen),
        LibraryGameId = candidate.LibraryGameId,
        Ply = candidate.Ply,
        MasterUci = candidate.MasterUci,
        AcceptedUci = [.. moment.AcceptedUci],
        BestLine = [.. moment.BestLine],
        Gap = (float)moment.Gap,
        Eco = game.Eco,
        OpeningName = game.OpeningName,
        Phase = CriticalMoments.Phase(candidate.Fen),
        White = game.White,
        Black = game.Black,
        Event = game.Event,
        Year = game.Year,
        CreatedAt = now,
    };

    /// <summary>The finished evaluations at the review's think time or longer, the longest per position.</summary>
    private async Task<Dictionary<string, Evaluation>> EvaluationsAsync(List<string> keys, CancellationToken ct)
    {
        int thinkMs = review.ThinkMs;
        List<PositionEvaluation> done = await db.PositionEvaluations.AsNoTracking()
            .Where(e => keys.Contains(e.PositionKey) && e.ThinkMs >= thinkMs && e.Status == PositionEvaluation.Done && e.Lines != null)
            .ToListAsync(ct);
        return done
            .GroupBy(e => e.PositionKey, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => AnalysisService.ToEvaluation(g.MaxBy(e => e.ThinkMs)!), StringComparer.Ordinal);
    }

    private async Task SaveAndAskAsync(List<ReviewPosition> missing, DateTimeOffset now, CancellationToken ct)
    {
        List<AnalysisRequestMessage> ask = await ReviewQueue.StageAsync(db, missing, review, analysis, now, ct);
        await db.SaveChangesAsync(ct);
        if (ask.Count > 0)
        {
            await requests.RequestReviewAsync(ask, ct);
        }
    }
}

/// <summary>What one round did.</summary>
internal sealed record MineOutcome(int Critical, int Quiet, int Added);

/// <summary>Runs one miner round in a scope of its own, for the singleton.</summary>
internal interface ITrainingMining
{
    Task<MineOutcome> RoundAsync(CancellationToken ct);
}

[ExcludeFromCodeCoverage(Justification = "Wiring: a scope around TrainingMineRound, which the unit tests run directly.")]
internal sealed class TrainingMining(
    IServiceScopeFactory scopes,
    IAnalysisRequests requests,
    TrainingOptions training,
    IOptions<ReviewOptions> review,
    IOptions<AnalysisOptions> analysis,
    TimeProvider clock,
    ILogger<TrainingMining> logger) : ITrainingMining
{
    public async Task<MineOutcome> RoundAsync(CancellationToken ct)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
        MineOutcome outcome = await new TrainingMineRound(db, requests, training, review.Value, analysis.Value, clock).RunAsync(ct);
        Log.TrainingMined(logger, outcome.Critical, outcome.Quiet, outcome.Added);
        return outcome;
    }
}

/// <summary>
/// The critical-moment miner (training D3): a cluster singleton that runs a round every <c>Training:MineSeconds</c>,
/// never two at once. It only decides when; the work is <see cref="ITrainingMining"/>.
/// </summary>
internal sealed class TrainingMiner : ReceiveActor, IWithTimers
{
    /// <summary>Each round is a trace of its own.</summary>
    protected override bool AroundReceive(Receive receive, object message) =>
        ActorTracing.Receive(ActorNames.TrainingMiner, message, m => base.AroundReceive(receive, m), m => m is Mine);

    public const string SingletonName = ActorNames.TrainingMiner;

    private readonly ITrainingMining _mining;
    private readonly TimeSpan _every;
    private readonly ILoggingAdapter _log = Context.GetLogger();
    private bool _running;

    public TrainingMiner(ITrainingMining mining, TimeSpan every)
    {
        _mining = mining;
        _every = every;
        Receive<Mine>(_ =>
        {
            if (_running)
            {
                return;
            }

            _running = true;
            _mining.RoundAsync(CancellationToken.None).PipeTo(Self, success: _ => Mined.Done, failure: e => new Mined(e));
        });
        Receive<Mined>(mined =>
        {
            _running = false;
            if (mined.Failure is not null)
            {
                _log.Warning(mined.Failure, "training miner round failed; trying again next time");
            }
        });
    }

    public ITimerScheduler Timers { get; set; } = null!;

    protected override void PreStart() => Timers.StartPeriodicTimer(nameof(Mine), Mine.Instance, _every);

    internal sealed class Mine
    {
        public static readonly Mine Instance = new();
    }

    private sealed record Mined(Exception? Failure = null)
    {
        public static readonly Mined Done = new();
    }
}
