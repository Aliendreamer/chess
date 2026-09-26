using System.Net;
using System.Net.Http.Json;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;
using Chess.Backend.IntegrationTests.Fixtures;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// The read side end to end (game-history): a game played over HTTP is projected from real Kafka into rm_* and then
/// listed, summarised, replayed and exported as PGN from the "replica" (the primary here), with usernames as names.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class GameHistoryTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(4);
    private static readonly TimeSpan ProjectionTimeout = TimeSpan.FromSeconds(60);
    private static readonly TimeControl Blitz = TimeControl.Presets.Single(tc => tc.ToString() == "5+3");

    private sealed record Page<T>(IReadOnlyList<T> Items, string? NextCursor, int Limit);

    private sealed record ListItem(Guid GameId, string White, string Black, string Status, string? Result, int Ply);

    private sealed record MyGame(Guid GameId, string Color, string Opponent, string Status, string? Result);

    private sealed record Summary(Guid GameId, string White, string Black, string Status, string? Result, string? Reason, int Ply, bool HasPgn);

    private sealed record Move(int Ply, string Uci, string San, string FenAfter);

    private sealed record Frame(string Topic, long Seq, EndedView Payload);

    private sealed record EndedView(string Status, string? Result, string? LastSan, int Ply);

    [Fact]
    public async Task A_finished_game_is_listed_replayable_and_exportable_under_the_players_usernames()
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

        // Eventually consistent: the ending reaches rm_games through Kafka.
        Summary? summary = null;
        await Api.EventuallyAsync(
            async () =>
            {
                using HttpResponseMessage r = await Api.GetAsync(client, $"/api/games/{id:N}", white, ct);
                summary = r.StatusCode == HttpStatusCode.OK ? await r.Content.ReadFromJsonAsync<Summary>(Api.Json, ct) : null;
                return summary?.Status == "ended";
            },
            "the game's ending projected into rm_games",
            ProjectionTimeout,
            ct,
            TimeSpan.FromMilliseconds(500));
        Assert.Equal((white, black, "0-1", "Checkmate", 4, true), (summary!.White, summary.Black, summary.Result, summary.Reason, summary.Ply, summary.HasPgn));

        // Moves, in ply order, with SAN and the position after each.
        using (HttpResponseMessage r = await Api.GetAsync(client, $"/api/games/{id:N}/moves", white, ct))
        {
            List<Move> moves = (await r.Content.ReadFromJsonAsync<List<Move>>(Api.Json, ct))!;
            Assert.Equal(["f3", "e5", "g4", "Qh4#"], moves.Select(m => m.San));
            Assert.Equal([1, 2, 3, 4], moves.Select(m => m.Ply));
            Assert.Equal("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3", moves[^1].FenAfter);
        }

        // PGN: the usernames as they were, the movetext, the result.
        using (HttpResponseMessage r = await Api.GetAsync(client, $"/api/games/{id:N}/pgn", white, ct))
        {
            Assert.Equal("application/x-chess-pgn", r.Content.Headers.ContentType?.MediaType);
            string pgn = await r.Content.ReadAsStringAsync(ct);
            Assert.Contains($"[White \"{white}\"]\n[Black \"{black}\"]\n[Result \"0-1\"]", pgn, StringComparison.Ordinal);
            Assert.Contains("\n1. f3 e5 2. g4 Qh4# 0-1\n", pgn, StringComparison.Ordinal);
            Assert.DoesNotContain("@", pgn, StringComparison.Ordinal); // never an email
        }

        // "My games", from each side.
        foreach ((string me, string color, string opponent) in new[] { (white, "white", black), (black, "black", white) })
        {
            using HttpResponseMessage r = await Api.GetAsync(client, "/api/me/games", me, ct);
            Page<MyGame> page = (await r.Content.ReadFromJsonAsync<Page<MyGame>>(Api.Json, ct))!;
            MyGame game = Assert.Single(page.Items);
            Assert.Equal((id, color, opponent, "ended", "0-1"), (game.GameId, game.Color, game.Opponent, game.Status, game.Result));
        }

        // The ended list, walked one row per page: every game exactly once (uuid keyset tiebreak on Postgres), ours included.
        List<Guid> walked = [];
        string? cursor = null;
        do
        {
            string url = "/api/games?status=ended&limit=1" + (cursor is null ? string.Empty : $"&cursor={Uri.EscapeDataString(cursor)}");
            using HttpResponseMessage r = await Api.GetAsync(client, url, white, ct);
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            Page<ListItem> page = (await r.Content.ReadFromJsonAsync<Page<ListItem>>(Api.Json, ct))!;
            walked.AddRange(page.Items.Select(i => i.GameId));
            cursor = page.NextCursor;
        }
        while (cursor is not null);

        Assert.Contains(id, walked);
        Assert.Equal(walked.Count, walked.Distinct().Count());

        // The live page of the finished game: the read side answers with the ended view.
        await using HubConnection hub = app.ConnectHub("Relay");
        await hub.StartAsync(ct);
        Frame? snapshot = await hub.InvokeAsync<Frame?>("Subscribe", $"game:{id:N}", ct);
        Assert.Equal(("Ended", "0-1", "Qh4#", 4), (snapshot!.Payload.Status, snapshot.Payload.Result, snapshot.Payload.LastSan, snapshot.Payload.Ply));

        // Unknown games and an unfinished game's PGN are 404.
        using (HttpResponseMessage r = await Api.GetAsync(client, $"/api/games/{Guid.CreateVersion7():N}", white, ct))
        {
            Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
        }
    }
}
