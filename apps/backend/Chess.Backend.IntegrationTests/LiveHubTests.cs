using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Chess.Backend.IntegrationTests.Fixtures;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// The live hub through a real SignalR client (design D2): only the Relay role gets in, Subscribe returns the
/// current state as a frame, a later ping pushes a newer seq to the group, and an unknown kind is refused.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class LiveHubTests(StackFixture stack)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);

    private sealed record PingPayload(string PingId, long Count, string? LastText, long LastSeq);

    private sealed record Frame(string Topic, long Seq, PingPayload Payload);

    [Fact]
    public async Task Relay_subscribes_gets_a_snapshot_then_newer_pushes_and_nobody_else_gets_in()
    {
        ArgumentNullException.ThrowIfNull(stack);
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        string id = $"it-{Guid.NewGuid():N}"[..20];
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        using (HttpResponseMessage first = await client.PostAsJsonAsync($"/api/pings/{id}", new { text = "before" }, Json, ct))
        {
            Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        }

        await using HubConnection relay = Connect(app, "Relay");
        TaskCompletionSource<Frame> pushed = new(TaskCreationOptions.RunContinuationsAsynchronously);
        relay.On<Frame>("frame", f => pushed.TrySetResult(f));
        await relay.StartAsync(ct);

        // Late subscriber: the state is there without waiting for another ping.
        Frame? snapshot = await relay.InvokeAsync<Frame?>("Subscribe", $"ping:{id}", ct);
        Assert.NotNull(snapshot);
        Assert.Equal(($"ping:{id}", 1L, "before"), (snapshot.Topic, snapshot.Seq, snapshot.Payload.LastText));

        using (HttpResponseMessage second = await client.PostAsJsonAsync($"/api/pings/{id}", new { text = "after" }, Json, ct))
        {
            Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        }

        Frame push = await pushed.Task.WaitAsync(TimeSpan.FromSeconds(15), ct);
        Assert.Equal((2L, "after"), (push.Seq, push.Payload.LastText));

        // Unknown kind: refused, and the connection survives it.
        await Assert.ThrowsAsync<HubException>(() => relay.InvokeAsync<Frame?>("Subscribe", "nope:x", ct));
        Assert.Equal(HubConnectionState.Connected, relay.State);

        // A plain user session (role User only) cannot negotiate the hub at all.
        await using HubConnection user = Connect(app, roles: null);
        HttpRequestException refused = await Assert.ThrowsAsync<HttpRequestException>(() => user.StartAsync(ct));
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
    }

    private static HubConnection Connect(PingApiFactory app, string? roles) =>
        new HubConnectionBuilder()
            .WithUrl(new Uri(app.Server.BaseAddress, "hub/live"), o =>
            {
                // TestServer has no socket to upgrade; long polling runs over its in-memory handler.
                o.Transports = HttpTransportType.LongPolling;
                o.HttpMessageHandlerFactory = _ => app.Server.CreateHandler();
                if (roles is not null)
                {
                    o.Headers[PingApiFactory.RolesHeader] = roles;
                }
            })
            .Build();
}
