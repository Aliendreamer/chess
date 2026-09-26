using System.Net;
using System.Net.Http.Json;
using Chess.Backend.IntegrationTests.Fixtures;
using Microsoft.AspNetCore.SignalR.Client;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// Matchmaking and invites end to end over HTTP on real Postgres: two seekers paired into a live game, and an invite
/// accepted once (the creator's colour honoured), refused a second time, and its acceptance pushed on the live hub.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class MatchmakingFlowTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);

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
        Queue heartbeat = await ReadAsync<Queue>(await SendAsync(client, HttpMethod.Post, "/api/matchmaking/5+3", $"it-a-{run}", null, ct), HttpStatusCode.OK, ct);
        Assert.Equal(("matched", second.GameId), (heartbeat.Status, heartbeat.GameId));

        Game game = await ReadAsync<Game>(await Api.GetAsync(client, $"/api/games/{second.GameId:N}/live", $"it-a-{run}", ct), HttpStatusCode.OK, ct);
        Assert.Equal((second.WhiteId, second.BlackId, "5+3"), (game.WhiteId, game.BlackId, game.TimeControl));

        Assert.Equal(HttpStatusCode.BadRequest, (await SendAsync(client, HttpMethod.Post, "/api/matchmaking/4+2", $"it-a-{run}", null, ct)).StatusCode);
    }

    [Fact]
    public async Task An_invite_is_accepted_once_honours_the_colour_and_is_pushed_live()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string run = Guid.NewGuid().ToString("N")[..8];
        long creator = await Api.ProvisionAsync(client, $"it-creator-{run}", ct);
        long friend = await Api.ProvisionAsync(client, $"it-friend-{run}", ct);
        await Api.ProvisionAsync(client, $"it-late-{run}", ct);

        Invite created = await ReadAsync<Invite>(
            await SendAsync(client, HttpMethod.Post, "/api/invites", $"it-creator-{run}", new { timeControl = "10+5", color = "black" }, ct),
            HttpStatusCode.Created,
            ct);
        Assert.Equal(("open", creator), (created.Status, created.CreatorId));
        string path = $"/api/invites/{created.InviteId:N}";

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
        Frame? snapshot = await hub.InvokeAsync<Frame?>("Subscribe", $"invite:{created.InviteId:N}", ct);
        Assert.Equal("open", snapshot!.Payload.Status);

        Invite taken = await ReadAsync<Invite>(await SendAsync(client, HttpMethod.Post, $"{path}/accept", $"it-friend-{run}", null, ct), HttpStatusCode.OK, ct);
        Assert.Equal("accepted", taken.Status);

        // The creator chose black, so the friend is White.
        Game game = await ReadAsync<Game>(await Api.GetAsync(client, $"/api/games/{taken.GameId:N}/live", $"it-friend-{run}", ct), HttpStatusCode.OK, ct);
        Assert.Equal((friend, creator, "10+5"), (game.WhiteId, game.BlackId, game.TimeControl));

        Assert.Equal(HttpStatusCode.Conflict, (await SendAsync(client, HttpMethod.Post, $"{path}/accept", $"it-late-{run}", null, ct)).StatusCode);
        Assert.Equal(taken.GameId, (await accepted.Task.WaitAsync(TimeSpan.FromSeconds(15), ct)).Payload.GameId);

        Invite read = await ReadAsync<Invite>(await Api.GetAsync(client, path, $"it-late-{run}", ct), HttpStatusCode.OK, ct);
        Assert.Equal(("accepted", taken.GameId), (read.Status, read.GameId));
    }

    [Fact]
    public async Task Only_the_creator_cancels_and_a_cancelled_invite_cannot_be_accepted()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string run = Guid.NewGuid().ToString("N")[..8];
        await Api.ProvisionAsync(client, $"it-creator-{run}", ct);
        await Api.ProvisionAsync(client, $"it-friend-{run}", ct);

        Invite created = await ReadAsync<Invite>(
            await SendAsync(client, HttpMethod.Post, "/api/invites", $"it-creator-{run}", new { timeControl = "5+3", color = "random" }, ct),
            HttpStatusCode.Created,
            ct);
        string path = $"/api/invites/{created.InviteId:N}";

        Assert.Equal(HttpStatusCode.Forbidden, (await SendAsync(client, HttpMethod.Post, $"{path}/cancel", $"it-friend-{run}", null, ct)).StatusCode);
        Invite cancelled = await ReadAsync<Invite>(await SendAsync(client, HttpMethod.Post, $"{path}/cancel", $"it-creator-{run}", null, ct), HttpStatusCode.OK, ct);
        Assert.Equal("cancelled", cancelled.Status);
        Assert.Equal(HttpStatusCode.Conflict, (await SendAsync(client, HttpMethod.Post, $"{path}/accept", $"it-friend-{run}", null, ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Api.GetAsync(client, $"/api/invites/{Guid.NewGuid():N}", $"it-friend-{run}", ct)).StatusCode);
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
