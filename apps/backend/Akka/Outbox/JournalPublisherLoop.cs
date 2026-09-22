using System.Diagnostics;
using Akka;
using Akka.Persistence.Query;
using Akka.Streams;
using Akka.Streams.Dsl;
using Chess.Backend.Akka.Ping;
using AkkaEnvelope = Akka.Persistence.Query.EventEnvelope;

namespace Chess.Backend.Akka.Outbox;

/// <summary>A live tail of one tag, starting strictly after <c>afterOrdering</c>.</summary>
internal delegate Source<AkkaEnvelope, NotUsed> JournalTail(string tag, long afterOrdering);

internal sealed class JournalPublisherOptions
{
    /// <summary>One stream (tag = Kafka topic) per entry, each with its own outbox_offsets row.</summary>
    public IReadOnlyList<string> Streams { get; init; } = [PingTopics.Kafka];

    public int BatchSize { get; init; } = 100;

    public TimeSpan BatchWindow { get; init; } = TimeSpan.FromMilliseconds(200);

    /// <summary>Wait between lease attempts and after a stop.</summary>
    public TimeSpan RetryDelay { get; init; } = TimeSpan.FromSeconds(5);

    /// <summary>How often an idle holder checks it still has the lease.</summary>
    public TimeSpan LivenessInterval { get; init; } = TimeSpan.FromSeconds(5);
}

/// <summary>
/// The outbox (design D4/D5): acquire the lease → per stream, load the offset → tail the journal after it →
/// map → produce (acks=all) → save the highest acked ordering through the lease. Any failure — broker, DB,
/// an unmapped event, a lost lease — stops every stream, releases the lease and starts over after
/// <see cref="JournalPublisherOptions.RetryDelay"/>, resuming from the saved offset. Nothing is ever skipped;
/// the price is re-sending at most one unsaved batch, which consumers absorb by (aggregateId, seq).
/// </summary>
internal sealed class JournalPublisherLoop(
    IMaterializer materializer,
    IPublisherLeaseProvider leases,
    JournalEventMappers mappers,
    JournalTail tail,
    Flow<(OutboxRecord Record, long Ordering), long, NotUsed> producer,
    JournalPublisherOptions options,
    ILogger<JournalPublisherLoop> logger)
{
    /// <summary>Runs until <paramref name="ct"/> is cancelled; never throws.</summary>
    public async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            IPublisherLease? lease;
            try
            {
                lease = await leases.TryAcquireAsync(ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return;
            }
            catch (Exception e)
            {
                Log.PublisherStopped(logger, e, "lease acquisition failed", options.RetryDelay);
                await DelayAsync(ct);
                continue;
            }

            if (lease is null)
            {
                Log.PublisherLeaseBusy(logger, options.RetryDelay);
                await DelayAsync(ct);
                continue;
            }

            await using (lease)
            {
                await PublishWhileHeldAsync(lease, ct);
            }

            await DelayAsync(ct);
        }
    }

    private async Task PublishWhileHeldAsync(IPublisherLease lease, CancellationToken ct)
    {
        using CancellationTokenSource session = CancellationTokenSource.CreateLinkedTokenSource(ct);
        List<Task> running = [.. options.Streams.Select(s => RunStreamAsync(s, lease, session.Token)), WatchLeaseAsync(lease, session.Token)];
        Task first = await Task.WhenAny(running);
        await session.CancelAsync();
        try
        {
            await Task.WhenAll(running);
        }
        catch (Exception)
        {
            // Every task but the first ends in cancellation; the first one's own outcome is reported below.
        }

        if (!ct.IsCancellationRequested)
        {
            Exception cause = first.Exception?.GetBaseException() ?? new InvalidOperationException("journal tail completed");
            Log.PublisherStopped(logger, cause, cause.GetType().Name, options.RetryDelay);
        }
    }

    private async Task RunStreamAsync(string streamId, IPublisherLease lease, CancellationToken ct)
    {
        long from = await lease.LoadOffsetAsync(streamId, ct);
        Log.PublisherLeaseAcquired(logger, streamId, from);
        (UniqueKillSwitch killSwitch, Task<Done> done) = tail(streamId, from)
            .Select(e => (mappers.Map(e.PersistenceId, e.SequenceNr, e.Event), ((Sequence)e.Offset).Value))
            .Via(producer)
            .GroupedWithin(options.BatchSize, options.BatchWindow)
            .SelectAsync(1, async batch =>
            {
                long acked = batch.Max();
                using Activity? activity = ActorTracing.StartOutboxBatch(streamId, batch.Count(), acked);
                await lease.SaveOffsetAsync(streamId, acked, ct);
                return acked;
            })
            .ViaMaterialized(KillSwitches.Single<long>(), Keep.Right)
            .ToMaterialized(Sink.Ignore<long>(), Keep.Both)
            .Run(materializer);
        await using (ct.Register(() => killSwitch.Abort(new OperationCanceledException(ct))))
        {
            await done;
        }
    }

    private async Task WatchLeaseAsync(IPublisherLease lease, CancellationToken ct)
    {
        while (true)
        {
            await Task.Delay(options.LivenessInterval, ct);
            await lease.EnsureHeldAsync(ct);
        }
    }

    private async Task DelayAsync(CancellationToken ct)
    {
        try
        {
            await Task.Delay(options.RetryDelay, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Shutting down; the loop condition ends it.
        }
    }
}
