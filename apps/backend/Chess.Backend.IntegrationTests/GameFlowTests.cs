using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;
using Chess.Backend.IntegrationTests.Fixtures;
using Confluent.Kafka;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// A game end to end on real Postgres and Redpanda: two players over HTTP, a spectator refused, the live hub's snapshot
/// and pushes, the events on Kafka in seq order — and a restarted process giving the side to move its clock back.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class GameFlowTests(StackFixture stack)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(4);
    private static readonly TimeControl Blitz = TimeControl.Presets.Single(tc => tc.ToString() == "5+3");

    private sealed record Me(long Id, string Subject);

    private sealed record View(Guid GameId, long WhiteId, long BlackId, string Status, int Ply, string? LastSan, long WhiteMs, long BlackMs, string? Result, string? Reason, long Seq);

    private sealed record Frame(string Topic, long Seq, View Payload);

    [Fact]
    public async Task Two_players_play_to_checkmate_and_the_game_reaches_kafka_and_the_live_hub()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string run = Guid.NewGuid().ToString("N")[..8];
        long white = await ProvisionAsync(client, $"it-white-{run}", ct);
        long black = await ProvisionAsync(client, $"it-black-{run}", ct);
        await ProvisionAsync(client, $"it-watch-{run}", ct);

        GameView started = await app.Services.GetRequiredService<IGameStarter>().StartAsync(white, black, Blitz, ct);
        Guid id = started.GameId;

        // A watcher on the live hub (as the BFF would be) gets the current view, then every move.
        await using HubConnection hub = new HubConnectionBuilder()
            .WithUrl(new Uri(app.Server.BaseAddress, "hub/live"), o =>
            {
                o.Transports = HttpTransportType.LongPolling;
                o.HttpMessageHandlerFactory = _ => app.Server.CreateHandler();
                o.Headers[PingApiFactory.RolesHeader] = "Relay";
            })
            .Build();
        List<Frame> pushed = [];
        hub.On<Frame>("frame", f =>
        {
            lock (pushed)
            {
                pushed.Add(f);
            }
        });
        await hub.StartAsync(ct);
        Frame? snapshot = await hub.InvokeAsync<Frame?>("Subscribe", $"game:{id:N}", ct);
        Assert.Equal(("Created", 0), (snapshot!.Payload.Status, snapshot.Payload.Ply));

        Assert.Equal(HttpStatusCode.Forbidden, (await MoveAsync(client, id, $"it-watch-{run}", "e2e4", ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await MoveAsync(client, id, $"it-black-{run}", "e7e5", ct)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await MoveAsync(client, id, $"it-white-{run}", "e2e5", ct)).StatusCode);

        View? last = null;
        foreach ((string who, string uci) in new[] { ("white", "f2f3"), ("black", "e7e5"), ("white", "g2g4"), ("black", "d8h4") })
        {
            using HttpResponseMessage r = await MoveAsync(client, id, $"it-{who}-{run}", uci, ct);
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            last = await r.Content.ReadFromJsonAsync<View>(Json, ct);
        }

        Assert.Equal(("Ended", "0-1", "Checkmate", "Qh4#", 4), (last!.Status, last.Result, last.Reason, last.LastSan, last.Ply));

        // The hub pushed each move (and the ending) with rising seq, the last one being the final view.
        await EventuallyAsync(() => Task.FromResult(Count(pushed) >= 5), "live frames for 4 moves + the ending", ct);
        List<Frame> frames;
        lock (pushed)
        {
            frames = [.. pushed];
        }

        Assert.Equal(frames.Select(f => f.Seq).Order(), frames.Select(f => f.Seq));
        Assert.Equal(("Ended", last.Seq), (frames[^1].Payload.Status, frames[^1].Seq));

        // Kafka: GameCreated, 4× MoveMade, GameEnded — keyed by the game, in seq order.
        List<(string Type, long Seq)> onKafka = await ReadGameEventsAsync(id, expected: 6, ct);
        Assert.Equal(["game.created", "game.move-made", "game.move-made", "game.move-made", "game.move-made", "game.ended"], onKafka.Select(e => e.Type));
        Assert.Equal([1L, 2, 3, 4, 5, 6], onKafka.Select(e => e.Seq));
    }

    [Fact]
    public async Task A_restarted_process_gives_the_side_to_move_its_clock_back()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        string run = Guid.NewGuid().ToString("N")[..8];
        Guid id;

        await using (PingApiFactory first = new())
        {
            using HttpClient client = await first.CreateReadyClientAsync(ct);
            long white = await ProvisionAsync(client, $"it-white-{run}", ct);
            long black = await ProvisionAsync(client, $"it-black-{run}", ct);
            id = (await first.Services.GetRequiredService<IGameStarter>().StartAsync(white, black, Blitz, ct)).GameId;
            foreach ((string who, string uci) in new[] { ("white", "e2e4"), ("black", "e7e5"), ("white", "g1f3") })
            {
                using HttpResponseMessage r = await MoveAsync(client, id, $"it-{who}-{run}", uci, ct);
                Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            }

            // Black to move. Its first move was free, so at the last event (White's g1f3) its clock is the full 5:00.
            await Task.Delay(TimeSpan.FromSeconds(2), ct); // Black thinks, then the process goes away
        }

        (PingApiFactory second, HttpClient again) = await StartAgainAsync(ct); // several seconds of "outage"
        await using PingApiFactory _ = second;
        using HttpClient __ = again;
        using HttpResponseMessage live = await again.GetAsync(new Uri($"/api/games/{id:N}/live", UriKind.Relative), ct);
        View view = (await live.Content.ReadFromJsonAsync<View>(Json, ct))!;

        // Forgiven: only the time since recovery counts, not the 2 s of thinking nor the several seconds of restart.
        Assert.Equal("Playing", view.Status);
        Assert.InRange(300_000 - view.BlackMs, 0, 1_500);
    }

    /// <summary>
    /// A fresh process on the same Akka port. The previous process's remoting socket can take a moment to close after
    /// dispose, so a bind conflict is retried rather than papered over with a fixed sleep.
    /// </summary>
    private static async Task<(PingApiFactory App, HttpClient Client)> StartAgainAsync(CancellationToken ct)
    {
        for (int attempt = 1; ; attempt++)
        {
            PingApiFactory app = new();
            try
            {
                return (app, await app.CreateReadyClientAsync(ct));
            }
            catch (InvalidOperationException e) when (attempt < 10 && e.ToString().Contains("Address already in use", StringComparison.Ordinal))
            {
                await app.DisposeAsync();
                await Task.Delay(TimeSpan.FromSeconds(1), ct);
            }
        }
    }

    private static async Task<long> ProvisionAsync(HttpClient client, string subject, CancellationToken ct)
    {
        using HttpRequestMessage me = new(HttpMethod.Get, "/api/me");
        me.Headers.Add(PingApiFactory.SubjectHeader, subject);
        using HttpResponseMessage r = await client.SendAsync(me, ct);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<Me>(Json, ct))!.Id;
    }

    private static async Task<HttpResponseMessage> MoveAsync(HttpClient client, Guid id, string subject, string uci, CancellationToken ct)
    {
        HttpRequestMessage req = new(HttpMethod.Post, $"/api/games/{id:N}/moves") { Content = JsonContent.Create(new { uci }, options: Json) };
        req.Headers.Add(PingApiFactory.SubjectHeader, subject);
        return await client.SendAsync(req, ct);
    }

    private static int Count(List<Frame> frames)
    {
        lock (frames)
        {
            return frames.Count;
        }
    }

    private async Task<List<(string Type, long Seq)>> ReadGameEventsAsync(Guid id, int expected, CancellationToken ct)
    {
        using IConsumer<string, string> consumer = new ConsumerBuilder<string, string>(new ConsumerConfig
        {
            BootstrapServers = stack.BootstrapServers,
            GroupId = $"it-game-{Guid.NewGuid():N}",
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = false,
        }).Build();
        consumer.Subscribe("game.events");
        string key = $"game:{id:N}";
        List<(string, long)> seen = [];
        Stopwatch elapsed = Stopwatch.StartNew();
        while (seen.Count < expected && elapsed.Elapsed < TimeSpan.FromSeconds(60))
        {
            ct.ThrowIfCancellationRequested();
            ConsumeResult<string, string>? r = consumer.Consume(TimeSpan.FromMilliseconds(500));
            if (r?.Message is { } m && m.Key == key)
            {
                using JsonDocument doc = JsonDocument.Parse(m.Value);
                seen.Add((doc.RootElement.GetProperty("type").GetString()!, doc.RootElement.GetProperty("seq").GetInt64()));
            }
        }

        consumer.Close();
        return seen;
    }

    private static async Task EventuallyAsync(Func<Task<bool>> condition, string what, CancellationToken ct)
    {
        Stopwatch elapsed = Stopwatch.StartNew();
        while (elapsed.Elapsed < TimeSpan.FromSeconds(30))
        {
            if (await condition())
            {
                return;
            }

            await Task.Delay(TimeSpan.FromMilliseconds(200), ct);
        }

        throw new TimeoutException($"not within 30 s: {what}");
    }
}
