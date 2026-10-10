using System.Net;
using System.Net.Http.Json;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;
using Chess.Backend.IntegrationTests.Fixtures;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// live-home end to end: a game in play reaches the in-play list with its position through Kafka and the projection, and
/// the lobby counts it. The lobby lists every preset queue.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class LobbyFlowTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan ProjectionTimeout = TimeSpan.FromSeconds(60);
    private static readonly TimeControl Rapid = TimeControl.Presets.Single(tc => tc.ToString() == "10+5");
    /// <summary>Placement and side to move; the en-passant field is the rules library's to write.</summary>
    private const string AfterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b ";

    private sealed record Page<T>(IReadOnlyList<T> Items, string? NextCursor, int Limit);

    private sealed record ListItem(Guid GameId, string Status, string? LastFen, string? LastUci);

    private sealed record Queue(string TimeControl, int Waiting);

    private sealed record Lobby(int GamesInPlay, IReadOnlyList<Queue>? Queues);

    [Fact]
    public async Task A_game_in_play_is_in_the_in_play_list_with_its_position_and_counted_by_the_lobby()
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

        Guid id = (await app.Services.GetRequiredService<IGameStarter>().StartAsync(whiteId, blackId, Rapid, ct)).GameId;
        using (HttpResponseMessage r = await Api.MoveAsync(client, id, white, "e2e4", ct))
        {
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        }

        // Eventually consistent: the move reaches rm_games through Kafka.
        ListItem? item = null;
        await Api.EventuallyAsync(
            async () =>
            {
                using HttpResponseMessage r = await Api.GetAsync(client, "/api/games?status=playing&limit=200", white, ct);
                Page<ListItem> page = (await r.Content.ReadFromJsonAsync<Page<ListItem>>(Api.Json, ct))!;
                item = page.Items.SingleOrDefault(i => i.GameId == id && i.LastUci == "e2e4");
                return item is not null;
            },
            "the game in the in-play list after its first move",
            ProjectionTimeout,
            ct,
            TimeSpan.FromMilliseconds(500));
        Assert.Equal("playing", item!.Status);
        Assert.StartsWith(AfterE4, item.LastFen, StringComparison.Ordinal);

        // The lobby's shared answer expires within Lobby:CacheSeconds.
        Lobby? lobby = null;
        await Api.EventuallyAsync(
            async () =>
            {
                using HttpResponseMessage r = await Api.GetAsync(client, "/api/lobby", black, ct);
                Assert.Equal(HttpStatusCode.OK, r.StatusCode);
                Assert.Equal("no-store", r.Headers.CacheControl?.ToString());
                lobby = await r.Content.ReadFromJsonAsync<Lobby>(Api.Json, ct);
                return lobby!.GamesInPlay >= 1;
            },
            "the lobby counting the game",
            ProjectionTimeout,
            ct,
            TimeSpan.FromMilliseconds(500));
        Assert.Equal(TimeControl.Presets.Select(p => p.ToString()), lobby!.Queues!.Select(q => q.TimeControl));
    }
}
