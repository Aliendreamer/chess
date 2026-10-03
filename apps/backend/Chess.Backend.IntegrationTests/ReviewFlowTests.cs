using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Chess.Backend.Akka.Games;
using Chess.Backend.Analysis;
using Chess.Backend.Games;
using Chess.Backend.IntegrationTests.Fixtures;
using Confluent.Kafka;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// game-review on real Postgres and Redpanda: a finished fool's mate is reviewed with a fake engine on the review topic
/// (never the interactive one), its blunder marked, and the loser's mistake practised.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class ReviewFlowTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);

    private sealed record Move(int Ply, string San, string? Class);

    private sealed record Review(string Status, int Evaluated, int Positions, IReadOnlyList<Move> Moves);

    private sealed record AddedView(int Added);

    private sealed record Item(Guid GameId, int Ply, string PlayedSan, IReadOnlyList<string> AcceptedUci);

    private sealed record Next(Item? Item);

    private sealed record Result(int Box);

    private static HttpRequestMessage As(HttpMethod method, string url, string subject, object? body = null)
    {
        HttpRequestMessage req = new(method, url);
        req.Headers.Add(PingApiFactory.SubjectHeader, subject);
        if (body is not null)
        {
            req.Content = JsonContent.Create(body, options: Api.Json);
        }

        return req;
    }

    private static async Task<HttpStatusCode> StatusAsync(HttpClient client, HttpRequestMessage req, CancellationToken ct)
    {
        using HttpResponseMessage r = await client.SendAsync(req, ct);
        return r.StatusCode;
    }

    private static async Task<T> ReadAsync<T>(HttpClient client, HttpRequestMessage req, CancellationToken ct)
    {
        using HttpResponseMessage r = await client.SendAsync(req, ct);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<T>(Api.Json, ct))!;
    }

    /// <summary>The fake engine's answer per position: the start, after f3, after e5, after g4.</summary>
    private static Dictionary<string, EvaluationLine> Answers()
    {
        ChessRules rules = ChessRules.NewGame();
        List<string> fens = [ChessRules.StartFen];
        foreach (string uci in new[] { "f2f3", "e7e5", "g2g4" })
        {
            fens.Add(((MoveApplied)rules.TryApply(uci)).FenAfter);
        }

        EvaluationLine[] lines = [new(20, null, ["e2e4"]), new(-50, null, ["e7e5"]), new(-60, null, ["b1c3"]), new(null, -1, ["d8h4"])];
        return fens.Select((fen, i) => (Key: PositionKey.Of(fen)!, Line: lines[i])).ToDictionary(x => x.Key, x => x.Line, StringComparer.Ordinal);
    }

    [Fact]
    public async Task A_finished_game_is_reviewed_and_its_blunder_practised()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string white = Api.NewId("it-rw"), black = Api.NewId("it-rb"), stranger = Api.NewId("it-rs");
        long whiteId = await Api.ProvisionAsync(client, white, ct);
        long blackId = await Api.ProvisionAsync(client, black, ct);
        await Api.ProvisionAsync(client, stranger, ct);
        IGameStarter starter = app.Services.GetRequiredService<IGameStarter>();
        TimeControl blitz = TimeControl.Presets.Single(tc => tc.ToString() == "5+3");

        using IConsumer<string, string> engine = new ConsumerBuilder<string, string>(new ConsumerConfig
        {
            BootstrapServers = stack.BootstrapServers,
            GroupId = $"it-fake-review-{Guid.NewGuid():N}",
            AutoOffsetReset = AutoOffsetReset.Earliest,
        }).Build();
        engine.Subscribe(AnalysisTopics.ReviewRequests);

        // A game in play is never reviewed.
        GameView playing = await starter.StartAsync(whiteId, blackId, blitz, ct);
        Assert.Equal(HttpStatusCode.OK, (await Api.MoveAsync(client, playing.GameId, white, "e2e4", ct)).StatusCode);
        // (404 until the projection has written the game.)
        await Api.EventuallyAsync(
            async () => await StatusAsync(client, As(HttpMethod.Post, $"/api/games/{playing.GameId:N}/review", white), ct) == HttpStatusCode.Conflict,
            "a game in play refused",
            TimeSpan.FromSeconds(30),
            ct,
            TimeSpan.FromMilliseconds(500));

        GameView game = await starter.StartAsync(whiteId, blackId, blitz, ct);
        foreach ((string who, string uci) in new[] { (white, "f2f3"), (black, "e7e5"), (white, "g2g4"), (black, "d8h4") })
        {
            Assert.Equal(HttpStatusCode.OK, (await Api.MoveAsync(client, game.GameId, who, uci, ct)).StatusCode);
        }

        string review = $"/api/games/{game.GameId:N}/review";
        Review? started = null;
        await Api.EventuallyAsync(
            async () =>
            {
                using HttpResponseMessage r = await client.SendAsync(As(HttpMethod.Post, review, black), ct);
                started = r.StatusCode == HttpStatusCode.OK ? await r.Content.ReadFromJsonAsync<Review>(Api.Json, ct) : null;
                return started is not null;
            },
            "the game ended on the replica",
            TimeSpan.FromSeconds(30),
            ct,
            TimeSpan.FromMilliseconds(500));
        Assert.Equal(("running", 4), (started!.Status, started.Positions));
        Assert.Equal(HttpStatusCode.Forbidden, await StatusAsync(client, As(HttpMethod.Post, review, stranger), ct));

        // The fake engine answers the review topic's requests on the results topic.
        Dictionary<string, EvaluationLine> answers = Answers();
        using (IProducer<string, string> producer = new ProducerBuilder<string, string>(new ProducerConfig { BootstrapServers = stack.BootstrapServers }).Build())
        {
            HashSet<string> answered = new(StringComparer.Ordinal);
            DateTime until = DateTime.UtcNow + TimeSpan.FromSeconds(30);
            while (answered.Count < answers.Count && DateTime.UtcNow < until)
            {
                if (engine.Consume(TimeSpan.FromMilliseconds(250)) is not { } record
                    || JsonSerializer.Deserialize<AnalysisRequestMessage>(record.Message.Value) is not { } request
                    || !answers.TryGetValue(request.Key, out EvaluationLine? line))
                {
                    continue;
                }

                AnalysisResultMessage result = new(request.Key, request.Fen, request.ThinkMs, 18, [line]);
                producer.Produce(AnalysisTopics.Results, new Message<string, string> { Key = request.Key, Value = JsonSerializer.Serialize(result) });
                answered.Add(request.Key);
            }

            producer.Flush(TimeSpan.FromSeconds(10));
            Assert.Equal(answers.Count, answered.Count);
        }

        Review? complete = null;
        await Api.EventuallyAsync(
            async () => (complete = await ReadAsync<Review>(client, As(HttpMethod.Get, review, stranger), ct)).Status == "complete",
            "the complete review",
            TimeSpan.FromSeconds(45),
            ct,
            TimeSpan.FromMilliseconds(500));
        Assert.Equal(["inaccuracy", "none", "blunder", "none"], complete!.Moves.Select(m => m.Class));

        // White practises the blunder: added once, offered, a wrong answer keeps it at box 0.
        Assert.Equal(1, (await ReadAsync<AddedView>(client, As(HttpMethod.Post, $"{review}/practice", white), ct)).Added);
        Assert.Equal(0, (await ReadAsync<AddedView>(client, As(HttpMethod.Post, $"{review}/practice", white), ct)).Added);
        Item item = (await ReadAsync<Next>(client, As(HttpMethod.Get, "/api/practice/next", white), ct)).Item!;
        Assert.Equal((game.GameId, 3, "g4"), (item.GameId, item.Ply, item.PlayedSan));
        Assert.Equal(["b1c3"], item.AcceptedUci);
        Result wrong = await ReadAsync<Result>(client, As(HttpMethod.Post, "/api/practice/results", white, new { gameId = game.GameId, ply = 3, correct = false }), ct);
        Assert.Equal(0, wrong.Box);
        Assert.Null((await ReadAsync<Next>(client, As(HttpMethod.Get, "/api/practice/next", black), ct)).Item);
    }
}
