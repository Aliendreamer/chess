using Confluent.Kafka;

namespace Chess.Backend.Messaging;

internal sealed class KafkaEventPublisher(IProducer<string, string> producer) : IEventPublisher, IDisposable
{
    public static IProducer<string, string> CreateProducer(KafkaOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        ProducerConfig config = new()
        {
            BootstrapServers = options.BootstrapServers,
            EnableIdempotence = true,
            Acks = Acks.All,
            MessageTimeoutMs = 10_000,
        };
        return new ProducerBuilder<string, string>(config).Build();
    }

    public async Task PublishAsync(string topic, string key, string json, CancellationToken ct)
    {
        ArgumentException.ThrowIfNullOrEmpty(topic);
        ArgumentException.ThrowIfNullOrEmpty(key);
        await producer.ProduceAsync(topic, new Message<string, string> { Key = key, Value = json }, ct);
    }

    public void Dispose()
    {
        producer.Flush(TimeSpan.FromSeconds(5));
        producer.Dispose();
    }
}
