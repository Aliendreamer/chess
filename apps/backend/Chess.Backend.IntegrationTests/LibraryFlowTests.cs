using System.Net;
using System.Net.Http.Json;
using Chess.Backend.Analysis;
using Chess.Backend.Games;
using Chess.Backend.IntegrationTests.Fixtures;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// game-library end to end on Postgres: an admin imports a batch (one new game, one duplicate, one illegal), a member
/// finds the game by part of a player's name in any case (pg_trgm ILIKE) and by ECO, opens it, finds it at a position
/// with the ply, and the seeded opening list names a position. A non-admin cannot import.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class LibraryFlowTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);

    private sealed record Item(int Index, string Status, string? Error, Guid? GameId);

    private sealed record ImportAnswer(int Imported, int Duplicates, int Refused, IReadOnlyList<Item> Items);

    private sealed record Listed(Guid Id, string White, string Black, int? Year, string? Eco, string? Opening, bool WorldChampionship, string Source, string Licence);

    private sealed record Page<T>(IReadOnlyList<T> Items, string? NextCursor, int Limit);

    private sealed record GameView(Listed Game, IReadOnlyList<string> Moves);

    private sealed record AtPosition(Guid Id, int Ply, string Result);

    private sealed record Position(int Games, int WhiteWins, int Draws, int BlackWins, IReadOnlyList<AtPosition> Items);

    private sealed record Named(string Eco, string Name);

    [Fact]
    public async Task An_imported_game_is_found_by_player_eco_and_position_and_openings_are_named()
    {
        ArgumentNullException.ThrowIfNull(stack);
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string run = Guid.NewGuid().ToString("N")[..8];
        string white = $"Anderssen-{run}, Adolf";
        string[] immortal = ["e2e4", "e7e5", "f2f4", "e5f4", "f1c4", "d8h4"];
        object Game(string w, string[] moves) => new
        {
            white = w,
            black = "Kieseritzky, Lionel",
            @event = "London casual",
            site = "London",
            round = "?",
            date = "1851.06.21",
            result = "1-0",
            eco = (string?)null,
            moves,
            startFen = (string?)null,
        };
        object batch = new
        {
            source = "Test",
            licence = "moves only (facts)",
            sourceRef = "test.pgn",
            worldChampionship = false,
            games = new[] { Game(white, immortal), Game(white.ToUpperInvariant(), immortal), Game("Someone", ["e2e4", "e7e4"]) },
        };

        using (HttpRequestMessage notAdmin = new(HttpMethod.Post, "/api/admin/library/import") { Content = JsonContent.Create(batch) })
        {
            notAdmin.Headers.Add(PingApiFactory.SubjectHeader, $"member-{run}");
            using HttpResponseMessage r = await client.SendAsync(notAdmin, ct);
            Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode);
        }

        ImportAnswer answer;
        using (HttpRequestMessage import = new(HttpMethod.Post, "/api/admin/library/import") { Content = JsonContent.Create(batch) })
        {
            import.Headers.Add(PingApiFactory.SubjectHeader, $"admin-{run}");
            import.Headers.Add(PingApiFactory.RolesHeader, "Admin");
            using HttpResponseMessage r = await client.SendAsync(import, ct);
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            answer = (await r.Content.ReadFromJsonAsync<ImportAnswer>(Api.Json, ct))!;
        }

        Assert.Equal((1, 1, 1), (answer.Imported, answer.Duplicates, answer.Refused));
        Assert.Equal(["imported", "duplicate", "refused"], answer.Items.Select(i => i.Status.ToLowerInvariant()));
        Assert.Contains("e7e4", answer.Items[2].Error, StringComparison.Ordinal);
        Guid id = answer.Items[0].GameId!.Value;

        // Part of a name, any case: answered by pg_trgm ILIKE on the replica (the primary in tests).
        using (HttpResponseMessage r = await Api.GetAsync(client, $"/api/library/games?player={Uri.EscapeDataString($"DERSSEN-{run}")}", "reader", ct))
        {
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            Listed found = Assert.Single((await r.Content.ReadFromJsonAsync<Page<Listed>>(Api.Json, ct))!.Items);
            Assert.Equal((id, 1851, "Test", "moves only (facts)", false), (found.Id, found.Year, found.Source, found.Licence, found.WorldChampionship));
            Assert.NotNull(found.Eco); // the King's Gambit is named by the seeded list
        }

        using (HttpResponseMessage r = await Api.GetAsync(client, $"/api/library/games?player={run}&eco=C3", "reader", ct))
        {
            Assert.Single((await r.Content.ReadFromJsonAsync<Page<Listed>>(Api.Json, ct))!.Items);
        }

        using (HttpResponseMessage r = await Api.GetAsync(client, $"/api/library/games/{id}", "reader", ct))
        {
            GameView view = (await r.Content.ReadFromJsonAsync<GameView>(Api.Json, ct))!;
            Assert.Equal(immortal, view.Moves);
        }

        string afterThree = PositionKey.Of(ChessRules.Replay(immortal[..3]).Fen)!;
        using (HttpResponseMessage r = await Api.GetAsync(client, $"/api/library/positions?key={Uri.EscapeDataString(afterThree)}", "reader", ct))
        {
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            Position position = (await r.Content.ReadFromJsonAsync<Position>(Api.Json, ct))!;
            AtPosition here = Assert.Single(position.Items, g => g.Id == id);
            Assert.Equal(3, here.Ply);
            Assert.True(position.WhiteWins >= 1);
        }

        string kingsGambit = PositionKey.Of(ChessRules.Replay(["e2e4", "e7e5", "f2f4"]).Fen)!;
        using (HttpResponseMessage r = await Api.GetAsync(client, $"/api/library/openings?key={Uri.EscapeDataString(kingsGambit)}", "reader", ct))
        {
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            Named named = (await r.Content.ReadFromJsonAsync<Named>(Api.Json, ct))!;
            Assert.Equal("C30", named.Eco);
            Assert.Contains("King's Gambit", named.Name, StringComparison.Ordinal);
        }
    }
}
