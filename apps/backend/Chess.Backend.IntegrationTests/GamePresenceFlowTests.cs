using System.Net;
using System.Net.Http.Json;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;
using Chess.Backend.IntegrationTests.Fixtures;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// Abandonment end to end on real Postgres and Redpanda: the relay's presence reports through the hub, the claim
/// offered live, the claim over HTTP, and the PGN on the read side. The fixture shortens the timings to
/// <see cref="StackFixture.AbandonAfterSeconds"/> / <see cref="StackFixture.PresenceLeaseSeconds"/>.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class GamePresenceFlowTests(StackFixture stack)
{
    private const string Instance = "it-bff";
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);
    private static readonly TimeControl Classical = TimeControl.Presets.Single(tc => tc.ToString() == "30+20");

    private sealed record View(string Status, long? AbsentId, long? ClaimableBy, string? Result, string? Reason, long Seq);

    private sealed record Frame(string Topic, long Seq, View Payload);

    [Fact]
    public async Task A_player_who_leaves_can_be_claimed_against_after_the_minute()
    {
        _ = stack;
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string run = Guid.NewGuid().ToString("N")[..8];
        long white = await Api.ProvisionAsync(client, $"it-white-{run}", ct);
        long black = await Api.ProvisionAsync(client, $"it-black-{run}", ct);
        Guid id = (await app.Services.GetRequiredService<IGameStarter>().StartAsync(white, black, Classical, ct)).GameId;
        string topic = $"game:{id:N}";

        // The BFF's side: one hub connection, reporting both players' sockets.
        await using HubConnection hub = app.ConnectHub("Relay");
        List<Frame> frames = [];
        hub.On<Frame>("frame", f =>
        {
            lock (frames)
            {
                frames.Add(f);
            }
        });
        await hub.StartAsync(ct);
        await hub.InvokeAsync<Frame?>("Subscribe", topic, ct);
        await hub.InvokeAsync("Present", topic, white, Instance, ct);
        await hub.InvokeAsync("Present", topic, black, Instance, ct);

        foreach ((string who, string uci) in new[] { ("white", "e2e4"), ("black", "e7e5") })
        {
            using HttpResponseMessage moved = await Api.MoveAsync(client, id, $"it-{who}-{run}", uci, ct);
            Assert.Equal(HttpStatusCode.OK, moved.StatusCode);
        }

        await hub.InvokeAsync("Absent", topic, black, Instance, ct);

        // White's relay keeps refreshing its lease while the claim window runs.
        await Api.EventuallyAsync(
            async () =>
            {
                await hub.InvokeAsync("Present", topic, white, Instance, ct);
                lock (frames)
                {
                    return frames.Any(f => f.Payload.ClaimableBy == white);
                }
            },
            "a frame offering White the claim",
            TimeSpan.FromSeconds(30),
            ct,
            TimeSpan.FromSeconds(1));

        Assert.Equal(HttpStatusCode.Conflict, (await Claim(client, id, $"it-black-{run}", "win", ct)).StatusCode);
        using HttpResponseMessage claimed = await Claim(client, id, $"it-white-{run}", "win", ct);
        Assert.Equal(HttpStatusCode.OK, claimed.StatusCode);
        View ended = (await claimed.Content.ReadFromJsonAsync<View>(Api.Json, ct))!;
        Assert.Equal(("ended", "1-0", "abandonment"), (ended.Status, ended.Result, ended.Reason));

        await Api.EventuallyAsync(
            async () =>
            {
                using HttpResponseMessage pgn = await Api.GetAsync(client, $"/api/games/{id:N}/pgn", $"it-white-{run}", ct);
                return pgn.StatusCode == HttpStatusCode.OK
                    && (await pgn.Content.ReadAsStringAsync(ct)).Contains("[Termination \"abandoned\"]", StringComparison.Ordinal);
            },
            "the PGN on the read side, terminated as abandoned",
            TimeSpan.FromSeconds(30),
            ct,
            TimeSpan.FromMilliseconds(500));
    }

    private static Task<HttpResponseMessage> Claim(HttpClient client, Guid id, string subject, string outcome, CancellationToken ct)
    {
        HttpRequestMessage req = new(HttpMethod.Post, $"/api/games/{id:N}/claim")
        {
            Content = JsonContent.Create(new { outcome }, options: Api.Json),
        };
        req.Headers.Add(PingApiFactory.SubjectHeader, subject);
        return client.SendAsync(req, ct);
    }
}
