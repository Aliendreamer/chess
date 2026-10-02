using System.Net;
using System.Net.Http.Json;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;
using Chess.Backend.IntegrationTests.Fixtures;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// player-profiles end to end: after a finished game, each player's public profile counts it from their side, their
/// games list it, and nothing private is in the answer. The computer players have profiles; unknown ids are 404.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class PlayerProfileFlowTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan ProjectionTimeout = TimeSpan.FromSeconds(60);
    private static readonly TimeControl Blitz = TimeControl.Presets.Single(tc => tc.ToString() == "3+2");

    private sealed record Record(string TimeControl, int Wins, int Draws, int Losses);

    private sealed record Profile(long Id, string Name, bool IsComputer, int Wins, int Draws, int Losses, IReadOnlyList<Record> ByTimeControl);

    private sealed record Page<T>(IReadOnlyList<T> Items, string? NextCursor, int Limit);

    private sealed record Game(Guid GameId, string Color, string Opponent, string Status, string? Result);

    [Fact]
    public async Task A_finished_game_counts_on_both_profiles_and_is_in_both_lists()
    {
        ArgumentNullException.ThrowIfNull(stack);
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string run = Guid.NewGuid().ToString("N")[..8];
        string white = $"w-{run}";
        string black = $"b-{run}";
        long whiteId = await Api.ProvisionAsync(client, white, ct);
        long blackId = await Api.ProvisionAsync(client, black, ct);

        Guid id = (await app.Services.GetRequiredService<IGameStarter>().StartAsync(whiteId, blackId, Blitz, ct)).GameId;
        foreach ((string who, string uci) in new[] { (white, "f2f3"), (black, "e7e5"), (white, "g2g4"), (black, "d8h4") })
        {
            using HttpResponseMessage r = await Api.MoveAsync(client, id, who, uci, ct);
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        }

        // Read as the other player: profiles are public to anyone signed in.
        Profile? winner = null;
        await Api.EventuallyAsync(
            async () =>
            {
                using HttpResponseMessage r = await Api.GetAsync(client, $"/api/players/{blackId}", white, ct);
                Assert.Equal(HttpStatusCode.OK, r.StatusCode);
                string body = await r.Content.ReadAsStringAsync(ct);
                Assert.DoesNotContain("@", body, StringComparison.Ordinal); // never an email
                winner = System.Text.Json.JsonSerializer.Deserialize<Profile>(body, Api.Json);
                return winner!.Wins == 1;
            },
            "the checkmate counted on Black's profile",
            ProjectionTimeout,
            ct,
            TimeSpan.FromMilliseconds(500));
        Assert.Equal((black, false, 1, 0, 0), (winner!.Name, winner.IsComputer, winner.Wins, winner.Draws, winner.Losses));
        Assert.Equal([new Record("3+2", 1, 0, 0)], winner.ByTimeControl);

        using (HttpResponseMessage r = await Api.GetAsync(client, $"/api/players/{whiteId}", black, ct))
        {
            Profile loser = (await r.Content.ReadFromJsonAsync<Profile>(Api.Json, ct))!;
            Assert.Equal((0, 0, 1), (loser.Wins, loser.Draws, loser.Losses));
        }

        using (HttpResponseMessage r = await Api.GetAsync(client, $"/api/players/{whiteId}/games", black, ct))
        {
            Game game = Assert.Single((await r.Content.ReadFromJsonAsync<Page<Game>>(Api.Json, ct))!.Items);
            Assert.Equal((id, "white", black, "ended", "0-1"), (game.GameId, game.Color, game.Opponent, game.Status, game.Result));
        }

        using (HttpResponseMessage r = await Api.GetAsync(client, "/api/players/-1", white, ct))
        {
            Profile engine = (await r.Content.ReadFromJsonAsync<Profile>(Api.Json, ct))!;
            Assert.True(engine.IsComputer);
        }

        using (HttpResponseMessage r = await Api.GetAsync(client, "/api/players/987654321", white, ct))
        {
            Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
        }
    }
}
