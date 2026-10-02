using System.Net;
using System.Net.Http.Json;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;
using Chess.Backend.IntegrationTests.Fixtures;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// live-home end to end: a game in play reaches the lobby's Club TV and count through Kafka and the projection, and the
/// in-play list carries its position for the Watch page's mini boards. The lobby lists every preset queue.
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

    private sealed record Tv(Guid GameId, string White, string Black, string TimeControl, string Fen, string? LastUci, int Ply);

    private sealed record Lobby(int GamesInPlay, IReadOnlyList<Queue>? Queues, IReadOnlyList<Tv> Tv);

    [Fact]
    public async Task A_game_in_play_is_on_club_tv_and_in_the_watch_list_with_its_position()
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

        // Eventually consistent: the move reaches rm_games through Kafka, and the lobby's shared answer expires.
        Tv? tv = null;
        Lobby? lobby = null;
        await Api.EventuallyAsync(
            async () =>
            {
                using HttpResponseMessage r = await Api.GetAsync(client, "/api/lobby", black, ct);
                Assert.Equal(HttpStatusCode.OK, r.StatusCode);
                Assert.Equal("no-store", r.Headers.CacheControl?.ToString());
                lobby = await r.Content.ReadFromJsonAsync<Lobby>(Api.Json, ct);
                tv = lobby!.Tv.SingleOrDefault(g => g.GameId == id && g.Ply == 1);
                return tv is not null;
            },
            "the game on Club TV after its first move",
            ProjectionTimeout,
            ct,
            TimeSpan.FromMilliseconds(500));
        Assert.Equal((white, black, "10+5", "e2e4"), (tv!.White, tv.Black, tv.TimeControl, tv.LastUci));
        Assert.StartsWith(AfterE4, tv.Fen, StringComparison.Ordinal);
        Assert.True(lobby!.GamesInPlay >= 1);
        Assert.Equal(TimeControl.Presets.Select(p => p.ToString()), lobby.Queues!.Select(q => q.TimeControl));

        using (HttpResponseMessage r = await Api.GetAsync(client, "/api/games?status=playing&limit=200", white, ct))
        {
            Page<ListItem> page = (await r.Content.ReadFromJsonAsync<Page<ListItem>>(Api.Json, ct))!;
            ListItem item = Assert.Single(page.Items, i => i.GameId == id);
            Assert.Equal(("playing", tv.Fen, "e2e4"), (item.Status, item.LastFen, item.LastUci));
        }
    }
}
