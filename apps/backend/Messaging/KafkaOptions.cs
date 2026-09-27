using Confluent.Kafka;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Chess.Backend.Messaging;

internal sealed class KafkaOptions : Extensions.ISettings
{
    public const string SectionName = "Kafka";

    /// <summary>Empty ⇒ Kafka disabled: no journal publisher, no consumers, no health check.</summary>
    public string BootstrapServers { get; set; } = string.Empty;

    public string GroupPrefix { get; set; } = "chess";

    /// <summary>How long the health check waits for broker metadata.</summary>
    public int HealthTimeoutSeconds { get; set; } = 3;

    /// <summary>How long a consumer waits before retrying after a failure.</summary>
    public int ConsumerRetrySeconds { get; set; } = 5;

    public bool Enabled => !string.IsNullOrWhiteSpace(BootstrapServers);

    public void Validate()
    {
        if (HealthTimeoutSeconds <= 0 || ConsumerRetrySeconds <= 0)
        {
            throw new InvalidOperationException("Kafka:HealthTimeoutSeconds and Kafka:ConsumerRetrySeconds must be positive.");
        }
    }
}

/// <summary>Healthy when the broker returns metadata with at least one broker known.</summary>
[ExcludeFromCodeCoverage(Justification = "Connection I/O against a live broker; proved by the integration suite (every test waits on /health) and verify-stack.sh.")]
internal sealed class KafkaHealthCheck : IHealthCheck, IDisposable
{
    private readonly IAdminClient _admin;
    private readonly TimeSpan _timeout;

    public KafkaHealthCheck(KafkaOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        _timeout = TimeSpan.FromSeconds(options.HealthTimeoutSeconds);
        _admin = new AdminClientBuilder(new AdminClientConfig { BootstrapServers = options.BootstrapServers }).Build();
    }

    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            Metadata metadata = _admin.GetMetadata(_timeout);
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
