using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Chess.Backend.Engine;
using Chess.Backend.IntegrationTests.Fixtures;
using Confluent.Kafka;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// A game against the engine on real Postgres and Redpanda (engine-play D6), with a fake engine in place of the worker:
/// it reads <c>engine.moves.requests</c> and answers on <c>engine.moves.results</c> the way each test tells it to.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class EngineFlowTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan MoveWait = TimeSpan.FromSeconds(45);

    private sealed record View(Guid GameId, string Status, int Ply, string? LastSan, string TimeControl, string? EngineSide, string? EngineLevel, long Seq);

    /// <summary>The fake engine: answers requests for one game with <c>answer(request, nth request for that ply)</c>, or skips when it returns null.</summary>
    private sealed class FakeEngine : IAsyncDisposable
    {
        private readonly CancellationTokenSource _stop = new();
        private readonly Task _loop;

        public FakeEngine(string bootstrapServers, Func<Guid> game, Func<EngineMoveRequest, int, string?> answer)
        {
            _loop = Task.Run(() => Run(bootstrapServers, game, answer, _stop.Token));
        }

        public List<EngineMoveRequest> Seen { get; } = [];

        public static void Answer(string bootstrapServers, EngineMoveResult result)
        {
            using IProducer<string, string> producer = new ProducerBuilder<string, string>(new ProducerConfig { BootstrapServers = bootstrapServers }).Build();
            producer.Produce(EngineTopics.Results, new Message<string, string> { Key = result.GameId, Value = JsonSerializer.Serialize(result) });
            producer.Flush(TimeSpan.FromSeconds(10));
        }

        public int Count(int ply)
        {
            lock (Seen)
            {
                return Seen.Count(r => r.Ply == ply);
            }
        }

        public async ValueTask DisposeAsync()
        {
            await _stop.CancelAsync();
            await _loop;
            _stop.Dispose();
        }

        private void Run(string bootstrapServers, Func<Guid> game, Func<EngineMoveRequest, int, string?> answer, CancellationToken ct)
        {
            using IConsumer<string, string> consumer = new ConsumerBuilder<string, string>(new ConsumerConfig
            {
                BootstrapServers = bootstrapServers,
                GroupId = $"it-fake-engine-{Guid.NewGuid():N}",
                AutoOffsetReset = AutoOffsetReset.Earliest,
            }).Build();
            consumer.Subscribe(EngineTopics.Requests);
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    ConsumeResult<string, string>? record = consumer.Consume(TimeSpan.FromMilliseconds(250));
                    if (record is null || JsonSerializer.Deserialize<EngineMoveRequest>(record.Message.Value) is not { } request
                        || request.GameId != game().ToString("N"))
                    {
                        continue;
                    }

                    int nth;
                    lock (Seen)
                    {
                        Seen.Add(request);
                        nth = Seen.Count(r => r.Ply == request.Ply);
                    }

                    if (answer(request, nth) is { } uci)
                    {
                        Answer(bootstrapServers, new EngineMoveResult(request.GameId, request.Ply, uci, request.Level));
                    }
                }
            }
            finally
            {
                consumer.Close();
            }
        }
    }

    private static async Task<View> StartAsync(HttpClient client, string subject, string level, string color, CancellationToken ct)
    {
        HttpRequestMessage req = new(HttpMethod.Post, "/api/engine-games") { Content = JsonContent.Create(new { level, color }, options: Api.Json) };
        req.Headers.Add(PingApiFactory.SubjectHeader, subject);
        using HttpResponseMessage r = await client.SendAsync(req, ct);
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<View>(Api.Json, ct))!;
    }

    private static async Task<View> LiveAsync(HttpClient client, Guid id, string subject, CancellationToken ct)
    {
        using HttpResponseMessage r = await Api.GetAsync(client, $"/api/games/{id:N}/live", subject, ct);
        return (await r.Content.ReadFromJsonAsync<View>(Api.Json, ct))!;
    }

    private static async Task<View> WaitForPlyAsync(HttpClient client, Guid id, string subject, int ply, CancellationToken ct)
    {
        View? view = null;
        await Api.EventuallyAsync(async () => (view = await LiveAsync(client, id, subject, ct)).Ply >= ply, $"ply {ply}", MoveWait, ct, TimeSpan.FromMilliseconds(250));
        return view!;
    }

    [Fact]
    public async Task The_engine_answers_a_move_and_a_repeated_answer_changes_nothing()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string human = Api.NewId("it-eng");
        await Api.ProvisionAsync(client, human, ct);

        View started = await StartAsync(client, human, "1600", "white", ct);
        Assert.Equal(("untimed", "black", "1600"), (started.TimeControl, started.EngineSide, started.EngineLevel));
        await using FakeEngine engine = new(stack.BootstrapServers, () => started.GameId, (r, _) => r.Ply == 1 ? "e7e5" : null);

        Assert.Equal(HttpStatusCode.OK, (await Api.MoveAsync(client, started.GameId, human, "e2e4", ct)).StatusCode);
        View answered = await WaitForPlyAsync(client, started.GameId, human, 2, ct);
        Assert.Equal(("playing", "e5"), (answered.Status, answered.LastSan));
        Assert.Equal("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", engine.Seen[0].Fen);

        // At-least-once: the same answer again is refused by the game (the ply has moved on) and changes nothing.
        FakeEngine.Answer(stack.BootstrapServers, new EngineMoveResult(started.GameId.ToString("N"), 1, "e7e5", "1600"));
        await Task.Delay(TimeSpan.FromSeconds(2), ct);
        Assert.Equal(answered.Seq, (await LiveAsync(client, started.GameId, human, ct)).Seq);
    }

    [Fact]
    public async Task The_engine_as_white_opens_without_the_human_doing_anything()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string human = Api.NewId("it-eng");
        await Api.ProvisionAsync(client, human, ct);

        View started = await StartAsync(client, human, "max", "black", ct);
        await using FakeEngine engine = new(stack.BootstrapServers, () => started.GameId, (r, _) => r.Ply == 0 ? "d2d4" : null);

        View opened = await WaitForPlyAsync(client, started.GameId, human, 1, ct);
        Assert.Equal(("white", "d4"), (started.EngineSide, opened.LastSan));
    }

    [Fact]
    public async Task A_lost_request_is_asked_again_after_the_stall_time()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string human = Api.NewId("it-eng");
        await Api.ProvisionAsync(client, human, ct);

        View started = await StartAsync(client, human, "2000", "white", ct);
        // The first request for ply 1 is "lost" (never answered); only the game's re-ask gets the move.
        await using FakeEngine engine = new(stack.BootstrapServers, () => started.GameId, (r, nth) => r.Ply == 1 && nth >= 2 ? "c7c5" : null);

        Assert.Equal(HttpStatusCode.OK, (await Api.MoveAsync(client, started.GameId, human, "e2e4", ct)).StatusCode);
        View answered = await WaitForPlyAsync(client, started.GameId, human, 2, ct);

        Assert.Equal("c5", answered.LastSan);
        Assert.True(engine.Count(1) >= 2, "the stalled game asked again");
    }
}
