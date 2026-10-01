using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;
using Chess.Backend.IntegrationTests.Fixtures;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// Correspondence games on real Postgres, Redpanda and Mailpit (correspondence-games D3–D4), with the move deadline
/// shortened to seconds: the sweeper ends a game nobody answers, and the players are mailed along the way.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class CorrespondenceFlowTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);

    private sealed record View(Guid GameId, string Status, int Ply, string? Result, string? Reason, DateTimeOffset? DeadlineAt);

    private static async Task<View> WaitEndedAsync(HttpClient client, Guid id, string subject, CancellationToken ct)
    {
        View? view = null;
        await Api.EventuallyAsync(
            async () =>
            {
                using HttpResponseMessage r = await Api.GetAsync(client, $"/api/games/{id:N}/live", subject, ct);
                view = await r.Content.ReadFromJsonAsync<View>(Api.Json, ct);
                return view?.Status == "ended";
            },
            "the deadline ends the game",
            TimeSpan.FromSeconds(60),
            ct,
            TimeSpan.FromMilliseconds(500));
        return view!;
    }

    /// <summary>The subjects of the mails Mailpit holds for <paramref name="address"/>.</summary>
    private async Task<List<string>> MailSubjectsAsync(string address, CancellationToken ct)
    {
        using HttpClient mailpit = new() { BaseAddress = stack.MailpitApi };
        using JsonDocument doc = JsonDocument.Parse(await mailpit.GetStringAsync("/api/v1/messages?limit=500", ct));
        return [.. doc.RootElement.GetProperty("messages").EnumerateArray()
            .Where(m => m.GetProperty("To").EnumerateArray().Any(t => t.GetProperty("Address").GetString() == address))
            .Select(m => m.GetProperty("Subject").GetString()!)];
    }

    [Fact]
    public async Task A_player_who_does_not_answer_loses_on_time_and_both_are_mailed()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string white = Api.NewId("it-cw");
        string black = Api.NewId("it-cb");
        long whiteId = await Api.ProvisionAsync(client, white, ct);
        long blackId = await Api.ProvisionAsync(client, black, ct);

        GameView started = await app.Services.GetRequiredService<IGameStarter>().StartAsync(whiteId, blackId, TimeControl.Correspondence7, ct);
        foreach ((string who, string uci) in new[] { (white, "e2e4"), (black, "e7e5"), (white, "g1f3") })
        {
            Assert.Equal(HttpStatusCode.OK, (await Api.MoveAsync(client, started.GameId, who, uci, ct)).StatusCode);
        }

        // Black never answers 2.Nf3: the sweeper finds the deadline and the game ends without anyone opening it.
        View ended = await WaitEndedAsync(client, started.GameId, white, ct);
        Assert.Equal(("1-0", "timeout", 3), (ended.Result, ended.Reason, ended.Ply));

        // White: the start, after 1…e5, the result. Black: after 1.e4, after 2.Nf3, the result. One mail each, no repeats.
        await Api.EventuallyAsync(
            async () => (await MailSubjectsAsync($"{black}@chess.localhost", ct)).Count >= 3 && (await MailSubjectsAsync($"{white}@chess.localhost", ct)).Count >= 3,
            "the mails",
            TimeSpan.FromSeconds(30),
            ct,
            TimeSpan.FromMilliseconds(500));
        Assert.Equal(
            [$"Your game against {black}: You won", $"Your move against {black}", $"Your move against {black}"],
            (await MailSubjectsAsync($"{white}@chess.localhost", ct)).Order());
        Assert.Equal(
            [$"Your game against {white}: You lost", $"Your move against {white}", $"Your move against {white}"],
            (await MailSubjectsAsync($"{black}@chess.localhost", ct)).Order());
    }

    [Fact]
    public async Task A_game_nobody_starts_is_aborted_at_the_deadline()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string white = Api.NewId("it-cw");
        long whiteId = await Api.ProvisionAsync(client, white, ct);
        long blackId = await Api.ProvisionAsync(client, Api.NewId("it-cb"), ct);

        GameView started = await app.Services.GetRequiredService<IGameStarter>().StartAsync(whiteId, blackId, TimeControl.Correspondence7, ct);

        View ended = await WaitEndedAsync(client, started.GameId, white, ct);
        Assert.Equal(("*", "aborted"), (ended.Result, ended.Reason));
    }
}
