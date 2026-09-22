using Chess.Backend.Messaging;
using Microsoft.Extensions.Logging;

namespace Chess.Backend.Tests.Messaging;

/// <summary>
/// Covers only the retry/no-crash contract of <see cref="KafkaConsumerHost.RunOnceWithRetryAsync"/> — the part
/// that decides whether an exception from stream materialization or a projection's ApplyAsync escapes and
/// faults the host. Exercising the actual Akka.Streams.Kafka pipeline needs a broker, which this sandbox does
/// not have and unit tests must not depend on; <see cref="RunOnceWithRetryAsync"/> is exposed internally
/// (mirroring <c>SessionCleanupService.RunOnceAsync</c>) precisely so this contract can be tested honestly
/// without one.
/// </summary>
public sealed class KafkaConsumerHostTests
{
    private static KafkaConsumerHost Host(Mock<ILogger<KafkaConsumerHost>> logger, TimeSpan retryDelay) =>
        new(system: null!, scopes: null!, new KafkaOptions(), logger.Object, retryDelay);

    [Fact]
    public async Task A_non_kafka_exception_is_logged_and_swallowed_not_thrown()
    {
        Mock<ILogger<KafkaConsumerHost>> logger = new();
        KafkaConsumerHost host = Host(logger, TimeSpan.FromMilliseconds(1));

        // Must not throw: this is exactly the case the brief calls out — "a crashed stream logged and
        // retried (5 s) rather than killing the host" — for any exception, not just Kafka/EF ones.
        await host.RunOnceWithRetryAsync(_ => throw new InvalidCastException("boom"), "chess.rm-pings", CancellationToken.None);

        Assert.NotEmpty(logger.Invocations);
    }

    [Fact]
    public async Task Cooperative_cancellation_returns_quietly_without_logging_or_retrying()
    {
        Mock<ILogger<KafkaConsumerHost>> logger = new();
        using CancellationTokenSource cts = new();
        cts.Cancel();
        KafkaConsumerHost host = Host(logger, TimeSpan.FromSeconds(30));

        await host.RunOnceWithRetryAsync(ct => throw new OperationCanceledException(ct), "chess.rm-pings", cts.Token);

        Assert.Empty(logger.Invocations);
    }

    [Fact]
    public async Task Cancellation_during_the_retry_backoff_also_returns_without_throwing()
    {
        Mock<ILogger<KafkaConsumerHost>> logger = new();
        using CancellationTokenSource cts = new(TimeSpan.FromMilliseconds(20));
        KafkaConsumerHost host = Host(logger, TimeSpan.FromSeconds(30));

        // Throws before the token is cancelled, so it logs and enters the 30s backoff; the token then cancels
        // mid-delay. Must still return cleanly instead of letting Task.Delay's OperationCanceledException escape.
        await host.RunOnceWithRetryAsync(_ => throw new InvalidCastException("boom"), "chess.rm-pings", cts.Token);

        Assert.NotEmpty(logger.Invocations);
    }
}
