using Confluent.Kafka;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Chess.Backend.Messaging;

internal sealed class KafkaOptions
{
    public const string SectionName = "Kafka";

    /// <summary>Empty ⇒ Kafka disabled: no journal publisher, no consumers, no health check.</summary>
    public string BootstrapServers { get; set; } = string.Empty;

    public string GroupPrefix { get; set; } = "chess";

    public bool Enabled => !string.IsNullOrWhiteSpace(BootstrapServers);
}

/// <summary>Healthy when the broker returns metadata with at least one broker known.</summary>
[ExcludeFromCodeCoverage(Justification = "Connection I/O against a live broker; proved by the integration suite (every test waits on /health) and verify-stack.sh.")]
internal sealed class KafkaHealthCheck : IHealthCheck, IDisposable
{
    private readonly IAdminClient _admin;

    public KafkaHealthCheck(KafkaOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        _admin = new AdminClientBuilder(new AdminClientConfig { BootstrapServers = options.BootstrapServers }).Build();
    }

    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            Metadata metadata = _admin.GetMetadata(TimeSpan.FromSeconds(3));
            HealthCheckResult result = metadata.Brokers.Count > 0
                ? HealthCheckResult.Healthy($"{metadata.Brokers.Count} broker(s) reachable")
                : HealthCheckResult.Unhealthy("No brokers returned");
            return Task.FromResult(result);
        }
        catch (KafkaException ex)
        {
            return Task.FromResult(HealthCheckResult.Unhealthy(ex.Message, ex));
        }
    }

    public void Dispose() => _admin.Dispose();
}
