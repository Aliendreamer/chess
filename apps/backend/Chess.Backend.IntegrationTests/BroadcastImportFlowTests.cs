using System.Net;
using System.Net.Http.Json;
using System.Text;
using Chess.Backend.Analysis;
using Chess.Backend.Games;
using Chess.Backend.IntegrationTests.Fixtures;
using Chess.Backend.Library;
using Microsoft.Extensions.DependencyInjection;
using ZstdSharp;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// broadcast-explorer end to end on Postgres: an admin starts a month, the importer singleton streams a synthetic
/// broadcast file (served in-process in place of lichess) into the library with its source, licence and game links, a
/// second run of the month is all duplicates, and the start and list endpoints refuse non-admins and bad months.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class BroadcastImportFlowTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);

    private sealed record Started(Guid RunId);

    private sealed record Run(Guid Id, string Month, string State, int Read, int Kept, int Imported, int Duplicate, int Refused, string? Error);

    private sealed record Listed(Guid Id, string White, string Source, string Licence);

    private sealed record Page<T>(IReadOnlyList<T> Items, string? NextCursor, int Limit);

    private sealed record Move(string Uci, int Games);

    private sealed record AtPosition(Guid Id, string Source, string? SourceRef);

    private sealed record Position(int Games, IReadOnlyList<AtPosition> Items, IReadOnlyList<Move> Moves);

    private sealed class Lichess(byte[] month) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(request.RequestUri!.AbsolutePath.EndsWith("lichess_db_broadcast_2026-08.pgn.zst", StringComparison.Ordinal)
                ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(month) }
                : new HttpResponseMessage(HttpStatusCode.NotFound));
    }

    private static string Game(string white, int elo, string moves) => $"""
        [Event "Round 1"]
        [White "{white}"]
        [Black "Broadcast, Black"]
        [Result "1-0"]
        [WhiteElo "{elo}"]
        [BlackElo "2550"]
        [Date "2026.08.01"]
        [BroadcastName "Synthetic Open 2026"]
        [GameURL "https://lichess.org/broadcast/synthetic/{white.Replace(' ', '-').Replace(",", "", StringComparison.Ordinal)}"]

        {moves} 1-0


        """;

    private static HttpRequestMessage AsAdmin(HttpMethod method, string url, string run, object? body = null)
    {
        HttpRequestMessage request = new(method, url) { Content = body is null ? null : JsonContent.Create(body) };
        request.Headers.Add(PingApiFactory.SubjectHeader, $"admin-{run}");
        request.Headers.Add(PingApiFactory.RolesHeader, "Admin");
        return request;
    }

    [Fact]
    public async Task An_admin_imports_a_month_and_running_it_again_adds_nothing()
    {
        ArgumentNullException.ThrowIfNull(stack);
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        string run = Guid.NewGuid().ToString("N")[..8];
        string text = Game($"Kept-{run}, A", 2600, "1. a3 h6 2. h3 a6 3. Nf3") + Game($"Kept-{run}, B", 2600, "1. d4 d5")
            + Game($"Weak-{run}, C", 2100, "1. c4 e5") + Game($"Illegal-{run}, D", 2600, "1. e4 e5 2. Ke3");
        byte[] month;
        using (Compressor compressor = new(3))
        {
            month = compressor.Wrap(Encoding.UTF8.GetBytes(text)).ToArray();
        }

        await using PingApiFactory app = new(services =>
            services.AddHttpClient(BroadcastImports.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => new Lichess(month)));
        using HttpClient client = await app.CreateReadyClientAsync(ct);

        using (HttpRequestMessage notAdmin = new(HttpMethod.Post, "/api/admin/library/broadcasts") { Content = JsonContent.Create(new { month = "2026-08" }) })
        {
            notAdmin.Headers.Add(PingApiFactory.SubjectHeader, $"member-{run}");
            using HttpResponseMessage r = await client.SendAsync(notAdmin, ct);
            Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode);
        }

        foreach (string bad in (string[])["2019-13", "2019-12", "2999-01"])
        {
            using HttpRequestMessage request = AsAdmin(HttpMethod.Post, "/api/admin/library/broadcasts", run, new { month = bad });
            using HttpResponseMessage r = await client.SendAsync(request, ct);
            Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        }

        Run first = await ImportAsync(client, run, ct);
        Assert.Equal(("finished", 4, 3, 2, 0, 1), (first.State, first.Read, first.Kept, first.Imported, first.Duplicate, first.Refused));

        using (HttpResponseMessage r = await Api.GetAsync(client, $"/api/library/games?player={Uri.EscapeDataString($"kept-{run}")}", "reader", ct))
        {
            List<Listed> found = [.. (await r.Content.ReadFromJsonAsync<Page<Listed>>(Api.Json, ct))!.Items];
            Assert.Equal(2, found.Count);
            Assert.All(found, g => Assert.Equal(("lichess broadcasts", "CC BY-SA 4.0"), (g.Source, g.Licence)));
        }

        // The explorer by source (broadcast-explorer D8): an unusual line, so other tests' games never share it.
        string key = Uri.EscapeDataString(PositionKey.Of(ChessRules.Replay(["a2a3", "h7h6", "h2h3", "a7a6"]).Fen)!);
        foreach ((string source, int games) in (ValueTuple<string, int>[])[("all", 1), ("broadcasts", 1), ("wc", 0)])
        {
            using HttpResponseMessage r = await Api.GetAsync(client, $"/api/library/positions?key={key}&source={source}", "reader", ct);
            Position position = (await r.Content.ReadFromJsonAsync<Position>(Api.Json, ct))!;
            Assert.Equal(games, position.Games);
            if (games == 1)
            {
                Assert.Equal("g1f3", Assert.Single(position.Moves).Uci);
                Assert.StartsWith("https://lichess.org/broadcast/", Assert.Single(position.Items).SourceRef, StringComparison.Ordinal);
            }
        }

        using (HttpResponseMessage r = await Api.GetAsync(client, $"/api/library/positions?key={key}&source=everything", "reader", ct))
        {
            Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        }

        Run second = await ImportAsync(client, run, ct);
        Assert.Equal((0, 2), (second.Imported, second.Duplicate));
    }

    private static async Task<Run> ImportAsync(HttpClient client, string run, CancellationToken ct)
    {
        Guid id;
        using (HttpRequestMessage start = AsAdmin(HttpMethod.Post, "/api/admin/library/broadcasts", run, new { month = "2026-08" }))
        {
            using HttpResponseMessage r = await client.SendAsync(start, ct);
            Assert.Equal(HttpStatusCode.Accepted, r.StatusCode);
            id = (await r.Content.ReadFromJsonAsync<Started>(Api.Json, ct))!.RunId;
        }

        Run? done = null;
        await Api.EventuallyAsync(
            async () =>
            {
                using HttpRequestMessage list = AsAdmin(HttpMethod.Get, "/api/admin/library/broadcasts", run);
                using HttpResponseMessage r = await client.SendAsync(list, ct);
                done = (await r.Content.ReadFromJsonAsync<List<Run>>(Api.Json, ct))!.SingleOrDefault(x => x.Id == id && x.State != "running");
                return done is not null;
            },
            "the broadcast import finished",
            TimeSpan.FromSeconds(60),
            ct);
        return done!;
    }
}
