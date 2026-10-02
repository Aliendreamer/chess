using Akka.Actor;
using Akka.TestKit.Xunit2;
using Chess.Backend.News;

namespace Chess.Backend.Tests.News;

public sealed class NewsFetcherTests : TestKit
{
    /// <summary>Rounds that finish when the test says so, counting how often each was started.</summary>
    private sealed class HeldRounds : INewsRounds
    {
        public int Feeds;
        public int Events;
        public TaskCompletionSource FeedsDone { get; set; } = new();
        public EventsOutcome Answer { get; set; } = EventsOutcome.Stored;

        public Task FetchFeedsAsync(CancellationToken ct)
        {
            Interlocked.Increment(ref Feeds);
            return FeedsDone.Task;
        }

        public Task<EventsOutcome> FetchEventsAsync(CancellationToken ct)
        {
            Interlocked.Increment(ref Events);
            return Task.FromResult(Answer);
        }
    }

    private static readonly TimeSpan Never = TimeSpan.FromHours(1); // the timers stay out of the way; the test sends the ticks

    [Fact]
    public void A_feed_round_never_overlaps_the_previous_one()
    {
        HeldRounds rounds = new();
        IActorRef fetcher = Sys.ActorOf(Props.Create(() => new NewsFetcher(rounds, new FakeClock(Time.Utc("2026-10-02T15:00:00Z")), Never, Never, Never)));

        fetcher.Tell(NewsFetcher.FetchFeeds.Instance);
        fetcher.Tell(NewsFetcher.FetchFeeds.Instance);
        AwaitCondition(() => rounds.Feeds == 1);
        ExpectNoMsg(TimeSpan.FromMilliseconds(200));
        Assert.Equal(1, rounds.Feeds);

        rounds.FeedsDone.SetResult();
        AwaitAssert(() =>
        {
            fetcher.Tell(NewsFetcher.FetchFeeds.Instance);
            Assert.Equal(2, rounds.Feeds);
        }, TimeSpan.FromSeconds(3), TimeSpan.FromMilliseconds(100));
    }

    [Fact]
    public void A_rate_limit_pauses_lichess_for_a_minute()
    {
        HeldRounds rounds = new() { Answer = EventsOutcome.RateLimited };
        FakeClock clock = new(Time.Utc("2026-10-02T15:00:00Z"));
        IActorRef fetcher = Sys.ActorOf(Props.Create(() => new NewsFetcher(rounds, clock, Never, Never, Never)));

        fetcher.Tell(NewsFetcher.FetchEvents.Instance);
        AwaitCondition(() => rounds.Events == 1);
        ExpectNoMsg(TimeSpan.FromMilliseconds(200)); // the 429 has come back

        clock.Advance(TimeSpan.FromSeconds(30));
        fetcher.Tell(NewsFetcher.FetchEvents.Instance);
        ExpectNoMsg(TimeSpan.FromMilliseconds(200));
        Assert.Equal(1, rounds.Events);

        clock.Advance(TimeSpan.FromSeconds(31));
        fetcher.Tell(NewsFetcher.FetchEvents.Instance);
        AwaitCondition(() => rounds.Events == 2);
    }

    [Fact]
    public void The_first_rounds_start_soon_after_the_node_does()
    {
        HeldRounds rounds = new();
        rounds.FeedsDone.SetResult();
        Sys.ActorOf(Props.Create(() => new NewsFetcher(rounds, TimeProvider.System, Never, Never, TimeSpan.FromMilliseconds(100))));

        AwaitCondition(() => rounds.Feeds == 1 && rounds.Events == 1, TimeSpan.FromSeconds(3));
    }
}
