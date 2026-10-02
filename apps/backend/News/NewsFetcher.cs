using Akka.Actor;
using Akka.Event;
using Chess.Backend.Akka;

namespace Chess.Backend.News;

/// <summary>
/// The news schedule (chess-news D1, D6): one per cluster, so every source sees one client however many nodes run. It
/// only decides when — the work is <see cref="INewsRounds"/> — and never starts a round while the previous one of the
/// same kind runs; after lichess answers 429 it waits <see cref="RateLimitPause"/> before asking again.
/// </summary>
internal sealed class NewsFetcher : ReceiveActor, IWithTimers
{
    /// <summary>Each round is a trace of its own.</summary>
    protected override bool AroundReceive(Receive receive, object message) =>
        ActorTracing.Receive(ActorNames.NewsFetcher, message, m => base.AroundReceive(receive, m), m => m is FetchFeeds or FetchEvents);

    public const string SingletonName = ActorNames.NewsFetcher;

    /// <summary>lichess asks for at least a minute after a 429.</summary>
    public static readonly TimeSpan RateLimitPause = TimeSpan.FromSeconds(60);

    private readonly INewsRounds _rounds;
    private readonly TimeProvider _clock;
    private readonly TimeSpan _feedsEvery;
    private readonly TimeSpan _eventsEvery;
    private readonly TimeSpan _firstAfter;
    private readonly ILoggingAdapter _log = Context.GetLogger();
    private bool _feedsRunning;
    private bool _eventsRunning;
    private DateTimeOffset _eventsPausedUntil = DateTimeOffset.MinValue;

    public NewsFetcher(INewsRounds rounds, TimeProvider clock, TimeSpan feedsEvery, TimeSpan eventsEvery, TimeSpan firstAfter)
    {
        _rounds = rounds;
        _clock = clock;
        _feedsEvery = feedsEvery;
        _eventsEvery = eventsEvery;
        _firstAfter = firstAfter;

        Receive<FetchFeeds>(_ =>
        {
            if (_feedsRunning)
            {
                return;
            }

            _feedsRunning = true;
            _rounds.FetchFeedsAsync(CancellationToken.None).PipeTo(Self, success: () => FeedsDone.Instance, failure: e => new FeedsDone(e));
        });
        Receive<FeedsDone>(done =>
        {
            _feedsRunning = false;
            if (done.Failure is not null)
            {
                _log.Warning(done.Failure, "news feeds round failed; trying again next time");
            }
        });
        Receive<FetchEvents>(_ =>
        {
            if (_eventsRunning || _clock.GetUtcNow() < _eventsPausedUntil)
            {
                return;
            }

            _eventsRunning = true;
            _rounds.FetchEventsAsync(CancellationToken.None).PipeTo(Self, success: o => new EventsDone(o), failure: _ => new EventsDone(EventsOutcome.Failed));
        });
        Receive<EventsDone>(done =>
        {
            _eventsRunning = false;
            if (done.Outcome == EventsOutcome.RateLimited)
            {
                _eventsPausedUntil = _clock.GetUtcNow() + RateLimitPause;
            }
        });
    }

    public ITimerScheduler Timers { get; set; } = null!;

    protected override void PreStart()
    {
        Timers.StartSingleTimer("first-feeds", FetchFeeds.Instance, _firstAfter);
        Timers.StartSingleTimer("first-events", FetchEvents.Instance, _firstAfter);
        Timers.StartPeriodicTimer(nameof(FetchFeeds), FetchFeeds.Instance, _feedsEvery);
        Timers.StartPeriodicTimer(nameof(FetchEvents), FetchEvents.Instance, _eventsEvery);
    }

    internal sealed class FetchFeeds
    {
        public static readonly FetchFeeds Instance = new();
    }

    internal sealed class FetchEvents
    {
        public static readonly FetchEvents Instance = new();
    }

    private sealed record FeedsDone(Exception? Failure = null)
    {
        public static readonly FeedsDone Instance = new();
    }

    private sealed record EventsDone(EventsOutcome Outcome);
}
