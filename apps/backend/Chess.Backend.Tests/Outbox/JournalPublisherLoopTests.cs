using System.Collections.Concurrent;
using Akka;
using Akka.Actor;
using Akka.Persistence.Query;
using Akka.Streams;
using Akka.Streams.Dsl;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Outbox;
using Chess.Backend.Akka.Ping;
using Chess.Backend.Events;
using AkkaEnvelope = Akka.Persistence.Query.EventEnvelope;

namespace Chess.Backend.Tests.Outbox;

public sealed class JournalPublisherLoopTests : TestKit
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);
    private static readonly DateTimeOffset At = DateTimeOffset.UnixEpoch;

    private sealed class FakeLease : IPublisherLease
    {
        public ConcurrentDictionary<string, long> Offsets { get; } = new();

        public bool Held { get; set; } = true;

        public bool Disposed { get; private set; }

        public Task<long> LoadOffsetAsync(string streamId, CancellationToken ct) =>
            Offsets.TryGetValue(streamId, out long o) ? Task.FromResult(o) : throw new InvalidOperationException("no row");

        public Task SaveOffsetAsync(string streamId, long ordering, CancellationToken ct)
        {
            if (!Held)
            {
                throw new InvalidOperationException("lost");
            }

            Offsets.AddOrUpdate(streamId, ordering, (_, old) => Math.Max(old, ordering));
            return Task.CompletedTask;
        }

        public Task EnsureHeldAsync(CancellationToken ct) => Held ? Task.CompletedTask : throw new InvalidOperationException("lost");

        public ValueTask DisposeAsync()
        {
            Disposed = true;
            return ValueTask.CompletedTask;
        }
    }

    private sealed class FakeProvider(params IPublisherLease?[] leases) : IPublisherLeaseProvider
    {
        private int _next;

        public int Attempts => _next;

        public Task<IPublisherLease?> TryAcquireAsync(CancellationToken ct)
        {
            int i = Interlocked.Increment(ref _next) - 1;
            return Task.FromResult(i < leases.Length ? leases[i] : null);
        }
    }

    private static AkkaEnvelope Ev(long ordering, string pingId, long seq, object? evt = null) =>
        new(Offset.Sequence(ordering), PingActor.PersistenceIdPrefix + pingId, seq, evt ?? new Pinged($"t{seq}", 1, At), 0, [PingTopics.Kafka]);

    private readonly ConcurrentQueue<(OutboxRecord Record, long Ordering)> _produced = new();
    private readonly ConcurrentQueue<long> _tailedFrom = new();

    private JournalPublisherLoop Loop(IPublisherLeaseProvider provider, Func<long, IEnumerable<AkkaEnvelope>> journal) => new(
        Sys.Materializer(),
        provider,
        new JournalEventMappers([new PingedJournalMapper()]),
        (tag, after) =>
        {
            _tailedFrom.Enqueue(after);
            // A live tail never completes on its own; Never keeps the stream open like EventsByTag does.
            return Source.From(journal(after)).Concat(Source.Never<AkkaEnvelope>());
        },
        Flow.Create<(OutboxRecord Record, long Ordering)>().Select(x =>
        {
            _produced.Enqueue(x);
            return x.Ordering;
        }),
        new JournalPublisherOptions
        {
            Streams = [PingTopics.Kafka],
            BatchSize = 2,
            BatchWindow = TimeSpan.FromMilliseconds(20),
            RetryDelay = TimeSpan.FromMilliseconds(20),
            LivenessInterval = TimeSpan.FromMilliseconds(20),
        },
        NullLogger<JournalPublisherLoop>.Instance);

    private static async Task Until(Func<bool> condition)
    {
        using CancellationTokenSource timeout = new(Wait);
        while (!condition())
        {
            await Task.Delay(10, timeout.Token);
        }
    }

    [Fact]
    public async Task Publishes_in_journal_order_and_saves_the_highest_acked_ordering()
    {
        FakeLease lease = new();
        lease.Offsets[PingTopics.Kafka] = 0;
        using CancellationTokenSource cts = new();
        Task run = Loop(new FakeProvider(lease), _ => [Ev(1, "a", 1), Ev(2, "b", 1), Ev(5, "a", 2)]).RunAsync(cts.Token);

        await Until(() => lease.Offsets[PingTopics.Kafka] == 5);
        await cts.CancelAsync();
        await run;

        Assert.Equal([1L, 2, 5], _produced.Select(p => p.Ordering));
        Assert.Equal(["ping:a", "ping:b", "ping:a"], _produced.Select(p => p.Record.Key));
        Assert.True(EventJson.TryDeserialize(_produced.Last().Record.Json, out EventEnvelope<Pinged>? e));
        Assert.Equal(2, e.Seq);
        Assert.True(lease.Disposed);
    }

    [Fact]
    public async Task Resumes_the_tail_after_the_stored_offset()
    {
        FakeLease lease = new();
        lease.Offsets[PingTopics.Kafka] = 41;
        using CancellationTokenSource cts = new();
        Task run = Loop(new FakeProvider(lease), after => after == 41 ? [Ev(42, "a", 9)] : [Ev(1, "a", 1)]).RunAsync(cts.Token);

        await Until(() => lease.Offsets[PingTopics.Kafka] == 42);
        await cts.CancelAsync();
        await run;

        Assert.Equal(41, _tailedFrom.First());
        Assert.Equal([42L], _produced.Select(p => p.Ordering));
    }

    [Fact]
    public async Task Does_not_publish_while_another_instance_holds_the_lease()
    {
        FakeLease lease = new();
        lease.Offsets[PingTopics.Kafka] = 0;
        FakeProvider provider = new(null, null, lease);
        using CancellationTokenSource cts = new();
        Task run = Loop(provider, _ => [Ev(1, "a", 1)]).RunAsync(cts.Token);

        await Until(() => lease.Offsets[PingTopics.Kafka] == 1);
        await cts.CancelAsync();
        await run;

        Assert.Equal(3, provider.Attempts);
        Assert.Single(_tailedFrom);
    }

    [Fact]
    public async Task Lost_lease_stops_publishing_and_re_acquires()
    {
        FakeLease first = new();
        first.Offsets[PingTopics.Kafka] = 0;
        FakeLease second = new();
        second.Offsets[PingTopics.Kafka] = 0;
        using CancellationTokenSource cts = new();
        Task run = Loop(new FakeProvider(first, second), _ => [Ev(1, "a", 1)]).RunAsync(cts.Token);

        await Until(() => first.Offsets[PingTopics.Kafka] == 1);
        first.Held = false;
        await Until(() => first.Disposed && second.Offsets[PingTopics.Kafka] == 1);
        await cts.CancelAsync();
        await run;

        Assert.True(second.Disposed);
    }

    [Fact]
    public async Task Unmapped_event_stops_before_it_and_never_advances_past_it()
    {
        FakeLease lease = new();
        lease.Offsets[PingTopics.Kafka] = 0;
        FakeProvider provider = new(lease, lease, lease);
        using CancellationTokenSource cts = new();
        Task run = Loop(provider, _ => [Ev(1, "a", 1), Ev(2, "a", 2, evt: "unmapped"), Ev(3, "a", 3)]).RunAsync(cts.Token);

        await Until(() => provider.Attempts >= 2);
        await cts.CancelAsync();
        await run;

        // Event 1 may or may not have been saved before the failure dropped its batch; 2 never is.
        Assert.True(lease.Offsets[PingTopics.Kafka] < 2);
        Assert.DoesNotContain(_produced, p => p.Ordering >= 2);
    }

    [Fact]
    public async Task Missing_offset_row_refuses_to_publish()
    {
        FakeLease lease = new(); // no row
        FakeProvider provider = new(lease, lease);
        using CancellationTokenSource cts = new();
        Task run = Loop(provider, _ => [Ev(1, "a", 1)]).RunAsync(cts.Token);

        await Until(() => provider.Attempts >= 2);
        await cts.CancelAsync();
        await run;

        Assert.Empty(_produced);
        Assert.Empty(_tailedFrom);
    }

    [Fact]
    public async Task Actor_runs_the_loop_and_stopping_it_releases_the_lease()
    {
        FakeLease lease = new();
        lease.Offsets[PingTopics.Kafka] = 0;
        Func<ActorSystem, JournalPublisherLoop> create = _ => Loop(new FakeProvider(lease), _ => [Ev(1, "a", 1)]);
        IActorRef actor = Sys.ActorOf(Props.Create(() => new JournalPublisher(create)));

        await Until(() => lease.Offsets[PingTopics.Kafka] == 1);
        Sys.Stop(actor);

        await Until(() => lease.Disposed);
    }
}
