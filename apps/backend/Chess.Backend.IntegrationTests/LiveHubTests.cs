using System.Net;
using Chess.Backend.IntegrationTests.Fixtures;
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
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);

    private sealed record PingPayload(string PingId, long Count, string? LastText, long LastSeq);

    private sealed record Frame(string Topic, long Seq, PingPayload Payload);

    [Fact]
    public async Task Relay_subscribes_gets_a_snapshot_then_newer_pushes_and_nobody_else_gets_in()
    {
        ArgumentNullException.ThrowIfNull(stack);
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        string id = Api.NewId();
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        await Api.PostPingAsync(client, id, "before", ct);

        await using HubConnection relay = app.ConnectHub("Relay");
        TaskCompletionSource<Frame> pushed = new(TaskCreationOptions.RunContinuationsAsynchronously);
        relay.On<Frame>("frame", f => pushed.TrySetResult(f));
        await relay.StartAsync(ct);

        // Late subscriber: the state is there without waiting for another ping.
        Frame? snapshot = await relay.InvokeAsync<Frame?>("Subscribe", $"ping:{id}", ct);
        Assert.NotNull(snapshot);
        Assert.Equal(($"ping:{id}", 1L, "before"), (snapshot.Topic, snapshot.Seq, snapshot.Payload.LastText));

        await Api.PostPingAsync(client, id, "after", ct);

        Frame push = await pushed.Task.WaitAsync(TimeSpan.FromSeconds(15), ct);
        Assert.Equal((2L, "after"), (push.Seq, push.Payload.LastText));

        // Unknown kind: refused, and the connection survives it.
        await Assert.ThrowsAsync<HubException>(() => relay.InvokeAsync<Frame?>("Subscribe", "nope:x", ct));
        Assert.Equal(HubConnectionState.Connected, relay.State);

        // A plain user session (role User only) cannot negotiate the hub at all.
        await using HubConnection user = app.ConnectHub(roles: null);
        HttpRequestException refused = await Assert.ThrowsAsync<HttpRequestException>(() => user.StartAsync(ct));
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
    }
}
