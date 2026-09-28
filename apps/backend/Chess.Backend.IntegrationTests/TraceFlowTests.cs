using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Text;
using Chess.Backend.Akka;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Outbox;
using Chess.Backend.Games;
using Chess.Backend.IntegrationTests.Fixtures;
using Confluent.Kafka;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// One trace from a move to Kafka on real Postgres and Redpanda (observability D3–D5): the HTTP request, the game actor
/// handling the move, the journal publisher's <c>publish</c> span, and the <c>traceparent</c> header on the record in
/// <c>game.events</c>, all in the same trace. A listener in the test process stands in for the exporter.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class TraceFlowTests(StackFixture stack)
{
    private static readonly TimeControl Blitz = TimeControl.Presets.Single(tc => tc.ToString() == "5+3");

    [Fact]
    public async Task A_moves_record_on_kafka_continues_the_moves_trace()
    {
        using CancellationTokenSource cts = new(TimeSpan.FromMinutes(3));
        CancellationToken ct = cts.Token;
        ConcurrentQueue<Activity> stopped = new();
        using ActivityListener listener = new()
        {
            ShouldListenTo = source => source.Name is ActorTracing.SourceName or PipelineTracing.SourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = stopped.Enqueue,
        };
        ActivitySource.AddActivityListener(listener);

        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string run = Guid.NewGuid().ToString("N")[..8];
        long white = await Api.ProvisionAsync(client, $"it-trace-w-{run}", ct);
        long black = await Api.ProvisionAsync(client, $"it-trace-b-{run}", ct);
        GameView started = await app.Services.GetRequiredService<IGameStarter>().StartAsync(white, black, Blitz, ct);
        string gameId = started.GameId.ToString("N");

        Assert.Equal(HttpStatusCode.OK, (await Api.MoveAsync(client, started.GameId, $"it-trace-w-{run}", "e2e4", ct)).StatusCode);
        Activity move = null!;
        await Api.EventuallyAsync(
            () => Task.FromResult((move = stopped.FirstOrDefault(a => a.OperationName == "game MakeMove" && Equals(a.GetTagItem("game.id"), gameId))!) is not null),
            "the game MakeMove span",
            TimeSpan.FromSeconds(20),
            ct);

        // The publisher's span for this move's record: once it exists the record is produced (and the topic created).
        Activity publish = null!;
        await Api.EventuallyAsync(
            () => Task.FromResult((publish = stopped.FirstOrDefault(a => a.OperationName == "publish game.events" && a.TraceId == move.TraceId)!) is not null),
            "the publish span",
            TimeSpan.FromSeconds(30),
            ct);

        using IConsumer<string, string> consumer = new ConsumerBuilder<string, string>(new ConsumerConfig
        {
            BootstrapServers = stack.BootstrapServers,
            GroupId = $"it-trace-{run}",
            AutoOffsetReset = AutoOffsetReset.Earliest,
        }).Build();
        consumer.Subscribe(GameTopics.Kafka);
        string? header = null;
        DateTime until = DateTime.UtcNow.AddSeconds(60);
        while (header is null && DateTime.UtcNow < until)
        {
            if (consumer.Consume(TimeSpan.FromMilliseconds(250)) is { } record
                && record.Message.Key == GameTopics.Key(gameId)
                && record.Message.Value.Contains("\"seq\":2,", StringComparison.Ordinal))
            {
                header = record.Message.Headers.TryGetLastBytes(PipelineTracing.TraceParentHeader, out byte[] value)
                    ? Encoding.UTF8.GetString(value)
                    : "none";
            }
        }

        consumer.Close();
        Assert.NotNull(header);
        Assert.StartsWith($"00-{move.TraceId.ToHexString()}-", header, StringComparison.Ordinal);
        Assert.Equal(publish.Id, header);
    }
}
