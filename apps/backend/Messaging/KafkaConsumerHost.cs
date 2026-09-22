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
/// One committable Kafka stream per registered projection. Offsets commit only after ApplyAsync returns,
/// so a crash re-delivers and the projection's idempotency does the rest.
/// </summary>
internal sealed class KafkaConsumerHost(ActorSystem system, IServiceScopeFactory scopes, KafkaOptions options, ILogger<KafkaConsumerHost> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using IServiceScope scope = scopes.CreateScope();
        IEnumerable<Type> projectionTypes = scope.ServiceProvider.GetServices<IProjection>().Select(p => p.GetType()).ToArray();
        IMaterializer materializer = system.Materializer();
        List<Task> streams = [];
        foreach (Type type in projectionTypes)
        {
            streams.Add(RunUntilCancelledAsync(type, materializer, stoppingToken));
        }

        await Task.WhenAll(streams);
    }

    private async Task RunUntilCancelledAsync(Type projectionType, IMaterializer materializer, CancellationToken ct)
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
            try
            {
                await KafkaConsumer.CommittableSource(settings, Subscriptions.Topics(topic))
                    .SelectAsync(1, async msg =>
                    {
                        using IServiceScope scope = scopes.CreateScope();
                        IProjection projection = (IProjection)scope.ServiceProvider.GetRequiredService(projectionType);
                        await projection.ApplyAsync(msg.Record.Message.Key, msg.Record.Message.Value, ct);
                        return (ICommittable)msg.CommitableOffset;
                    })
                    .RunWith(Committer.Sink(CommitterSettings.Create(system)), materializer);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex) when (ex is KafkaException or InvalidOperationException or DbUpdateException)
            {
                Log.ConsumerStreamFailed(logger, ex, groupId);
                await Task.Delay(TimeSpan.FromSeconds(5), ct);
            }
        }
    }
}
