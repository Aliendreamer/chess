namespace Chess.Backend.Messaging;

internal sealed class KafkaOptions
{
    public const string SectionName = "Kafka";

    /// <summary>Empty ⇒ Kafka disabled: NullEventPublisher, no consumers, no health check.</summary>
    public string BootstrapServers { get; set; } = string.Empty;

    public string GroupPrefix { get; set; } = "chess";

    public bool Enabled => !string.IsNullOrWhiteSpace(BootstrapServers);
}
