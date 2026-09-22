namespace Chess.Backend.Messaging;

internal interface IEventPublisher
{
    Task PublishAsync(string topic, string key, string json, CancellationToken ct);
}
