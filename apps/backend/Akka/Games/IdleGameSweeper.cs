using Akka.Actor;
using Akka.Event;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Games;

namespace Chess.Backend.Akka.Games;

/// <summary>
/// The untimed games in play that have been quiet for <c>Akka:UntimedIdleMinutes</c>, oldest first, from the primary
/// (the replica may lag): woken so a game against the computer nobody is at ends by abandonment (engine-game-abandonment D4).
/// </summary>
internal interface IIdleGames
{
    Task<IReadOnlyList<Guid>> QuietAsync(DateTimeOffset now, int max, CancellationToken ct);
}

internal sealed class IdleGames(IServiceScopeFactory scopes, AkkaOptions akka) : IIdleGames
{
    public async Task<IReadOnlyList<Guid>> QuietAsync(DateTimeOffset now, int max, CancellationToken ct)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
        return await QueryAsync(db, now, max, TimeSpan.FromMinutes(akka.UntimedIdleMinutes), ct);
    }

    public static async Task<IReadOnlyList<Guid>> QueryAsync(ProjectDbContext db, DateTimeOffset now, int max, TimeSpan untimedIdle, CancellationToken ct)
    {
        string untimed = TimeControl.Untimed.ToString();
        DateTimeOffset quietSince = now - untimedIdle;
        return await db.RmGames.AsNoTracking()
            .Where(g => g.TimeControl == untimed && g.Status == RmGame.Playing && g.UpdatedAt <= quietSince)
            .OrderBy(g => g.UpdatedAt)
            .Take(max)
            .Select(g => g.GameId)
            .ToListAsync(ct);
    }
}

/// <summary>
/// A cluster singleton (engine-game-abandonment D4): every <see cref="AkkaOptions.IdleSweepSeconds"/> it wakes each quiet
/// untimed game with <see cref="WakeIdle"/>. The game is the judge — its recovery and timers decide — so a row that is stale
/// or seen twice costs one harmless wake; a game keeps being woken each sweep until its end reaches the read model.
/// </summary>
internal sealed class IdleGameSweeper : ReceiveActor, IWithTimers
{
    /// <summary>Each sweep is a trace of its own: the games it wakes continue it.</summary>
    protected override bool AroundReceive(Receive receive, object message) =>
        ActorTracing.Receive(ActorNames.IdleGameSweeper, message, m => base.AroundReceive(receive, m), m => m is Sweep);

    public const string SingletonName = ActorNames.IdleGameSweeper;

    /// <summary>At most this many wakes per sweep; the rest wait for the next one.</summary>
    public const int MaxPerSweep = 100;

    private readonly IActorRef _games;
    private readonly IIdleGames _idle;
    private readonly TimeProvider _clock;
    private readonly TimeSpan _every;
    private readonly ILoggingAdapter _log = Context.GetLogger();

    public IdleGameSweeper(IActorRef games, IIdleGames idle, TimeProvider clock, TimeSpan every)
    {
        _games = games;
        _idle = idle;
        _clock = clock;
        _every = every;
        Receive<Sweep>(_ => _idle.QuietAsync(_clock.GetUtcNow(), MaxPerSweep, CancellationToken.None).PipeTo(Self, success: ids => ActorTracing.Wrap(ids)));
        Receive<IReadOnlyList<Guid>>(ids =>
        {
            foreach (Guid id in ids)
            {
                _games.Tell(ActorTracing.Wrap(new WakeIdle(id)));
            }
        });
        Receive<Status.Failure>(f => _log.Warning(f.Cause, "idle-game sweep failed; trying again next time"));
    }

    public ITimerScheduler Timers { get; set; } = null!;

    protected override void PreStart() => Timers.StartPeriodicTimer(nameof(Sweep), Sweep.Instance, _every);

    internal sealed class Sweep
    {
        public static readonly Sweep Instance = new();
    }
}
