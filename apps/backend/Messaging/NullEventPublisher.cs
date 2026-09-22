namespace Chess.Backend.Messaging;

/// <summary>No-op sink: used until Task 6 wires Kafka, and as the fallback when Kafka:BootstrapServers is empty.</summary>
internal sealed class NullEventPublisher : IEventPublisher
{
    public Task PublishAsync(string topic, string key, string json, CancellationToken ct) => Task.CompletedTask;
}
