using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Chess.Backend.Analysis;
using Chess.Backend.IntegrationTests.Fixtures;
using Confluent.Kafka;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// The shared evaluation cache on real Postgres and Redpanda (engine-analysis D2, D4), with a fake engine in place of the
/// worker: it reads <c>analysis.requests</c> and answers every request on <c>analysis.results</c>.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class AnalysisFlowTests(StackFixture stack)
{
    private const string Fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 40";
    private const string Key = "4k3/8/8/8/8/8/4P3/4K3 w - -";

    private sealed record Line(int? Cp, int? Mate, IReadOnlyList<string> Pv);

    private sealed record EvaluationView(int ThinkMs, int Depth, IReadOnlyList<Line> Lines);

    private sealed record PositionView(string Key, string Fen, EvaluationView? Evaluation);

    private sealed record AnalysisView(string Think, int ThinkMs, IReadOnlyList<PositionView> Positions);

    private static async Task<AnalysisView> AnalyseAsync(HttpClient client, string subject, string think, CancellationToken ct)
    {
        HttpRequestMessage req = new(HttpMethod.Post, "/api/analysis") { Content = JsonContent.Create(new { positions = new[] { Fen }, think }, options: Api.Json) };
        req.Headers.Add(PingApiFactory.SubjectHeader, subject);
        using HttpResponseMessage r = await client.SendAsync(req, ct);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<AnalysisView>(Api.Json, ct))!;
    }

    [Fact]
    public async Task A_position_is_evaluated_once_and_then_served_from_the_cache()
    {
        using CancellationTokenSource cts = new(TimeSpan.FromMinutes(3));
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string subject = Api.NewId("it-an");
        await Api.ProvisionAsync(client, subject, ct);

        using IConsumer<string, string> engine = new ConsumerBuilder<string, string>(new ConsumerConfig
        {
            BootstrapServers = stack.BootstrapServers,
            GroupId = $"it-fake-analysis-{Guid.NewGuid():N}",
            AutoOffsetReset = AutoOffsetReset.Earliest,
        }).Build();
        engine.Subscribe(KafkaAnalysisRequests.Topic);

        AnalysisView first = await AnalyseAsync(client, subject, "normal", ct);
        Assert.Equal((Key, (EvaluationView?)null), (first.Positions[0].Key, first.Positions[0].Evaluation));

        AnalysisRequestMessage request = NextRequest(engine, ct)!;
        Assert.Equal((Key, Fen, 3_000, 3), (request.Key, request.Fen, request.ThinkMs, request.MultiPv));
        using (IProducer<string, string> producer = new ProducerBuilder<string, string>(new ProducerConfig { BootstrapServers = stack.BootstrapServers }).Build())
        {
            AnalysisResultMessage result = new(Key, Fen, 3_000, 24, [new EvaluationLine(250, null, ["e1d2", "e8d7"])]);
            producer.Produce("analysis.results", new Message<string, string> { Key = Key, Value = JsonSerializer.Serialize(result) });
            producer.Flush(TimeSpan.FromSeconds(10));
        }

        AnalysisView? answered = null;
        await Api.EventuallyAsync(async () => (answered = await AnalyseAsync(client, subject, "quick", ct)).Positions[0].Evaluation is not null,
            "the stored evaluation", TimeSpan.FromSeconds(45), ct, TimeSpan.FromMilliseconds(250));
        EvaluationView evaluation = answered!.Positions[0].Evaluation!;
        Assert.Equal((3_000, 24, 250), (evaluation.ThinkMs, evaluation.Depth, evaluation.Lines[0].Cp));
        Assert.Equal(["e1d2", "e8d7"], evaluation.Lines[0].Pv);

        // Served from the cache: neither the same think time nor a shorter one asks the engine again.
        Assert.NotNull((await AnalyseAsync(client, subject, "normal", ct)).Positions[0].Evaluation);
        Assert.Null(NextRequest(engine, ct, TimeSpan.FromSeconds(3)));
    }

    private static AnalysisRequestMessage? NextRequest(IConsumer<string, string> engine, CancellationToken ct, TimeSpan? within = null)
    {
        DateTime until = DateTime.UtcNow + (within ?? TimeSpan.FromSeconds(30));
        while (DateTime.UtcNow < until && !ct.IsCancellationRequested)
        {
            if (engine.Consume(TimeSpan.FromMilliseconds(250)) is { } record
                && JsonSerializer.Deserialize<AnalysisRequestMessage>(record.Message.Value) is { Key: Key } request)
            {
                return request;
            }
        }

        return null;
    }
}
