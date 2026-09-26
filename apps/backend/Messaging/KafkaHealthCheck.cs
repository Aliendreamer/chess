using Confluent.Kafka;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Chess.Backend.Messaging;

/// <summary>Healthy when the broker returns metadata with at least one broker known.</summary>
internal sealed class KafkaHealthCheck : IHealthCheck, IDisposable
{
    internal static readonly TimeSpan DefaultMetadataTimeout = TimeSpan.FromSeconds(3);

    private readonly IAdminClient _admin;
    private readonly TimeSpan _metadataTimeout;

    public KafkaHealthCheck(KafkaOptions options)
        : this(options, DefaultMetadataTimeout)
    {
    }

    /// <summary>Internal so DI only sees the public constructor; tests shorten the metadata timeout.</summary>
    internal KafkaHealthCheck(KafkaOptions options, TimeSpan metadataTimeout)
    {
        ArgumentNullException.ThrowIfNull(options);
        _metadataTimeout = metadataTimeout;
        _admin = new AdminClientBuilder(new AdminClientConfig { BootstrapServers = options.BootstrapServers }).Build();
    }

    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            Metadata metadata = _admin.GetMetadata(_metadataTimeout);
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
