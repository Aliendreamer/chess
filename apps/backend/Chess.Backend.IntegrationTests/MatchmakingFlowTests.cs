using System.Net;
using System.Net.Http.Json;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;
using Chess.Backend.IntegrationTests.Fixtures;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// Matchmaking and rematches end to end over HTTP on real Postgres: two seekers paired into a live game, and a rematch
/// offered by one player, accepted by the other with the colours swapped, and its acceptance pushed on the live hub.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class MatchmakingFlowTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);
    private static readonly TimeControl Blitz = TimeControl.Presets.Single(tc => tc.ToString() == "3+2");

    private sealed record Queue(string Status, string TimeControl, int? Position, int? Waiting, Guid? GameId, long? WhiteId, long? BlackId);

    private sealed record Invite(Guid InviteId, long CreatorId, string TimeControl, string Color, string Status, Guid? GameId, long Seq);

    private sealed record Game(Guid GameId, long WhiteId, long BlackId, string TimeControl, string Status);

    private sealed record Frame(string Topic, long Seq, Invite Payload);

    [Fact]
    public async Task Two_seekers_on_one_time_control_are_paired_into_a_game()
    {
        _ = stack;
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string run = Guid.NewGuid().ToString("N")[..8];
        long a = await Api.ProvisionAsync(client, $"it-a-{run}", ct);
        long b = await Api.ProvisionAsync(client, $"it-b-{run}", ct);

        Queue first = await ReadAsync<Queue>(await SendAsync(client, HttpMethod.Post, "/api/matchmaking/5+3", $"it-a-{run}", null, ct), HttpStatusCode.OK, ct);
        Assert.Equal(("waiting", 1), (first.Status, first.Position));

        Queue second = await ReadAsync<Queue>(await SendAsync(client, HttpMethod.Post, "/api/matchmaking/5+3", $"it-b-{run}", null, ct), HttpStatusCode.OK, ct);
        Assert.Equal("matched", second.Status);
        Assert.Equal([a, b], new[] { second.WhiteId!.Value, second.BlackId!.Value }.Order());

        // The first seeker's next heartbeat learns the same pairing.
        Queue heartbeat = await ReadAsync<Queue>(await SendAsync(client, HttpMethod.Post, "/api/matchmaking/5+3?heartbeat=true", $"it-a-{run}", null, ct), HttpStatusCode.OK, ct);
        Assert.Equal(("matched", second.GameId), (heartbeat.Status, heartbeat.GameId));

        Game game = await ReadAsync<Game>(await Api.GetAsync(client, $"/api/games/{second.GameId:N}/live", $"it-a-{run}", ct), HttpStatusCode.OK, ct);
        Assert.Equal((second.WhiteId, second.BlackId, "5+3"), (game.WhiteId, game.BlackId, game.TimeControl));

        Assert.Equal(HttpStatusCode.BadRequest, (await SendAsync(client, HttpMethod.Post, "/api/matchmaking/4+2", $"it-a-{run}", null, ct)).StatusCode);
    }

    [Fact]
    public async Task Both_players_asking_for_a_rematch_start_it_with_the_colours_swapped()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string run = Guid.NewGuid().ToString("N")[..8];
        long creator = await Api.ProvisionAsync(client, $"it-creator-{run}", ct);
        long friend = await Api.ProvisionAsync(client, $"it-friend-{run}", ct);
        await Api.ProvisionAsync(client, $"it-watcher-{run}", ct);

        // A game the creator plays as White, aborted before any move.
        GameView started = await app.Services.GetRequiredService<IGameStarter>().StartAsync(creator, friend, Blitz, ct);
        string game = $"/api/games/{started.GameId:N}";
        Assert.Equal(HttpStatusCode.Conflict, (await SendAsync(client, HttpMethod.Post, $"{game}/rematch", $"it-creator-{run}", null, ct)).StatusCode);
        (await SendAsync(client, HttpMethod.Post, $"{game}/abort", $"it-creator-{run}", null, ct)).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.Forbidden, (await SendAsync(client, HttpMethod.Post, $"{game}/rematch", $"it-watcher-{run}", null, ct)).StatusCode);
        Invite offered = await ReadAsync<Invite>(await SendAsync(client, HttpMethod.Post, $"{game}/rematch", $"it-creator-{run}", null, ct), HttpStatusCode.OK, ct);
        Assert.Equal((started.GameId, "open", "black"), (offered.InviteId, offered.Status, offered.Color));

        // The game page watches invite:{gameId}: the snapshot is the open offer, the agreement is pushed.
        await using HubConnection hub = app.ConnectHub("Relay");
        TaskCompletionSource<Frame> accepted = new(TaskCreationOptions.RunContinuationsAsynchronously);
        hub.On<Frame>("frame", f =>
        {
            if (f.Payload.Status == "accepted")
            {
                accepted.TrySetResult(f);
            }
        });
        await hub.StartAsync(ct);
        Frame? snapshot = await hub.InvokeAsync<Frame?>("Subscribe", $"invite:{started.GameId:N}", ct);
        Assert.Equal("open", snapshot!.Payload.Status);

        Invite agreed = await ReadAsync<Invite>(await SendAsync(client, HttpMethod.Post, $"{game}/rematch", $"it-friend-{run}", null, ct), HttpStatusCode.OK, ct);
        Assert.Equal("accepted", agreed.Status);
        Game rematch = await ReadAsync<Game>(await Api.GetAsync(client, $"/api/games/{agreed.GameId:N}/live", $"it-friend-{run}", ct), HttpStatusCode.OK, ct);
        Assert.Equal((friend, creator, "3+2"), (rematch.WhiteId, rematch.BlackId, rematch.TimeControl));
        Assert.Equal(agreed.GameId, (await accepted.Task.WaitAsync(TimeSpan.FromSeconds(15), ct)).Payload.GameId);
    }

    private static Task<HttpResponseMessage> SendAsync(HttpClient client, HttpMethod method, string url, string subject, object? body, CancellationToken ct)
    {
        HttpRequestMessage req = new(method, url) { Content = body is null ? null : JsonContent.Create(body, options: Api.Json) };
        req.Headers.Add(PingApiFactory.SubjectHeader, subject);
        return client.SendAsync(req, ct);
    }

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response, HttpStatusCode expected, CancellationToken ct)
    {
        using (response)
        {
            Assert.True(expected == response.StatusCode, $"{expected} expected, got {response.StatusCode}: {await response.Content.ReadAsStringAsync(ct)}");
            return (await response.Content.ReadFromJsonAsync<T>(Api.Json, ct))!;
        }
    }
}
