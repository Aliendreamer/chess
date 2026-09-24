using Akka.Streams;
using Akka.Streams.Dsl;
using Akka.Streams.Kafka.Dsl;
using Akka.Streams.Kafka.Helpers;
using Akka.Streams.Kafka.Messages;
using Akka.Streams.Kafka.Settings;
using Chess.Backend.Projections;
using Confluent.Kafka;

namespace Chess.Backend.Messaging;

/// <summary>
/// One committable Kafka stream per registered projection. Each record goes through <see cref="ProjectionRunner"/>,
/// which retries, resolves watermark races and parks poison records; the offset commits only after it returns, so a
/// crash re-delivers and the projection's idempotency does the rest. What the runner lets through — a broker error,
/// a stream-stage failure, a gap, cancellation — is logged and the stream is retried after a backoff rather than
/// being allowed to fault this BackgroundService.
/// </summary>
internal sealed class KafkaConsumerHost(
    ActorSystem system,
    IServiceScopeFactory scopes,
    KafkaOptions options,
    ILogger<KafkaConsumerHost> logger,
    TimeSpan? retryDelay = null) : BackgroundService
{
    private readonly TimeSpan _retryDelay = retryDelay ?? TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using IServiceScope scope = scopes.CreateScope();
        IEnumerable<Type> projectionTypes = scope.ServiceProvider.GetServices<IProjection>().Select(p => p.GetType()).ToArray();
        ProjectionRunner runner = scope.ServiceProvider.GetRequiredService<ProjectionRunner>();
        IMaterializer materializer = system.Materializer();
        List<Task> streams = [];
        foreach (Type type in projectionTypes)
        {
            streams.Add(RunUntilCancelledAsync(type, runner, materializer, stoppingToken));
        }

        await Task.WhenAll(streams);
    }

    private async Task RunUntilCancelledAsync(Type projectionType, ProjectionRunner runner, IMaterializer materializer, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            string groupId;
            string topic;
            using (IServiceScope probe = scopes.CreateScope())
            {
                IProjection p = (IProjection)probe.ServiceProvider.GetRequiredService(projectionType);
                groupId = p.GroupId;
                topic = p.Topic;
            }

            ConsumerSettings<string, string> settings = ConsumerSettings<string, string>
                .Create(system, Deserializers.Utf8, Deserializers.Utf8)
                .WithBootstrapServers(options.BootstrapServers)
                .WithGroupId(groupId)
                .WithProperty("auto.offset.reset", "earliest");

            await RunOnceWithRetryAsync(
                streamCt => KafkaConsumer.CommittableSource(settings, Subscriptions.Topics(topic))
                    .SelectAsync(1, async msg =>
                    {
                        await runner.RunAsync(projectionType, groupId, msg.Record.Message.Key, msg.Record.Message.Value, streamCt);
                        return (ICommittable)msg.CommitableOffset;
                    })
                    .RunWith(Committer.Sink(CommitterSettings.Create(system)), materializer),
                groupId,
                ct);
        }
    }

    /// <summary>
    /// Runs one materialization of <paramref name="runStream"/> and never lets an exception escape it: a
    /// cooperative cancellation of <paramref name="ct"/> returns quietly, and anything else — Kafka errors, a
    /// stream-stage fault, or a projection's ApplyAsync throwing — is logged and swallowed after a backoff, so
    /// the caller's loop can retry instead of the host dying. Exposed internally so the retry contract can be
    /// unit-tested without a broker.
    /// </summary>
    internal async Task RunOnceWithRetryAsync(Func<CancellationToken, Task> runStream, string groupId, CancellationToken ct)
    {
        try
        {
            await runStream(ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return;
        }
        catch (Exception ex)
        {
            Log.ConsumerStreamFailed(logger, ex, groupId);
            try
            {
                await Task.Delay(_retryDelay, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                // Shutting down while waiting to retry — let the caller's loop exit on the next check.
            }
        }
    }
}
