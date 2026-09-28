using System.Net;
using System.Net.Http.Json;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;
using Chess.Backend.IntegrationTests.Fixtures;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.IntegrationTests;

/// <summary>Studies over HTTP on real Postgres (studies D1–D6): the jsonb tree, versions, sharing and a game made a study.</summary>
[Collection(StackFixture.Collection)]
public sealed class StudyFlowTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);

    private sealed record Move(string Uci, string San, string Fen, List<Move> Children);

    private sealed record Study(Guid Id, string Title, List<Move> Tree, bool Shared, long Version, bool Mine);

    private sealed record Created(Guid Id, string Title);

    private sealed record Import(List<Created> Created, List<object> Refused);

    private static HttpRequestMessage As(HttpMethod method, string url, string subject, object? body = null)
    {
        HttpRequestMessage req = new(method, url);
        req.Headers.Add(PingApiFactory.SubjectHeader, subject);
        if (body is not null)
        {
            req.Content = JsonContent.Create(body, options: Api.Json);
        }

        return req;
    }

    private static async Task<T> ReadAsync<T>(HttpClient client, HttpRequestMessage req, HttpStatusCode expected, CancellationToken ct)
    {
        using HttpResponseMessage r = await client.SendAsync(req, ct);
        Assert.Equal(expected, r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<T>(Api.Json, ct))!;
    }

    [Fact]
    public async Task A_study_is_imported_saved_shared_and_read_by_another_user()
    {
        _ = stack;
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string ann = Api.NewId("it-sa");
        string bob = Api.NewId("it-sb");
        await Api.ProvisionAsync(client, ann, ct);
        await Api.ProvisionAsync(client, bob, ct);

        Import import = await ReadAsync<Import>(client, As(HttpMethod.Post, "/api/studies", ann, new
        {
            studies = new object[]
            {
                new { title = "Ruy", tree = new[] { new { uci = "e2e4", children = new[] { new { uci = "e7e5" } } } } },
                new { title = "Broken", tree = new[] { new { uci = "e2e5" } } },
            },
        }), HttpStatusCode.Created, ct);
        Guid id = Assert.Single(import.Created).Id;
        Assert.Single(import.Refused);

        Study opened = await ReadAsync<Study>(client, As(HttpMethod.Get, $"/api/studies/{id:N}", ann), HttpStatusCode.OK, ct);
        Study saved = await ReadAsync<Study>(client, As(HttpMethod.Put, $"/api/studies/{id:N}", ann, new
        {
            title = "Ruy, with d6",
            tree = new[] { new { uci = "e2e4", children = new[] { new { uci = "e7e5" }, new { uci = "d7d6" } } } },
            version = opened.Version,
        }), HttpStatusCode.OK, ct);
        Assert.Equal("d6", saved.Tree[0].Children[1].San);
        using (HttpResponseMessage stale = await client.SendAsync(As(HttpMethod.Put, $"/api/studies/{id:N}", ann, new { title = "x", tree = Array.Empty<object>(), version = opened.Version }), ct))
        {
            Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        }

        using (HttpResponseMessage hidden = await client.SendAsync(As(HttpMethod.Get, $"/api/studies/{id:N}", bob), ct))
        {
            Assert.Equal(HttpStatusCode.NotFound, hidden.StatusCode);
        }

        await ReadAsync<Study>(client, As(HttpMethod.Post, $"/api/studies/{id:N}/share", ann, new { shared = true }), HttpStatusCode.OK, ct);
        Study seen = await ReadAsync<Study>(client, As(HttpMethod.Get, $"/api/studies/{id:N}", bob), HttpStatusCode.OK, ct);
        Assert.Equal((false, "Ruy, with d6"), (seen.Mine, seen.Title));

        using HttpResponseMessage pgn = await client.SendAsync(As(HttpMethod.Get, $"/api/studies/{id:N}/pgn", bob), ct);
        Assert.Contains("1. e4 e5 (1... d6) *", await pgn.Content.ReadAsStringAsync(ct), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_finished_game_opens_as_a_study()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string white = Api.NewId("it-sw");
        string black = Api.NewId("it-sk");
        long whiteId = await Api.ProvisionAsync(client, white, ct);
        long blackId = await Api.ProvisionAsync(client, black, ct);
        GameView game = await app.Services.GetRequiredService<IGameStarter>().StartAsync(whiteId, blackId, TimeControl.Presets.Single(tc => tc.ToString() == "5+3"), ct);
        foreach ((string who, string uci) in new[] { (white, "f2f3"), (black, "e7e5"), (white, "g2g4"), (black, "d8h4") })
        {
            Assert.Equal(HttpStatusCode.OK, (await Api.MoveAsync(client, game.GameId, who, uci, ct)).StatusCode);
        }

        // The projection writes the moves a moment after the game ends.
        Study? study = null;
        await Api.EventuallyAsync(
            async () =>
            {
                using HttpResponseMessage r = await client.SendAsync(As(HttpMethod.Post, $"/api/games/{game.GameId:N}/study", black), ct);
                study = r.StatusCode == HttpStatusCode.Created ? await r.Content.ReadFromJsonAsync<Study>(Api.Json, ct) : null;
                return study is not null;
            },
            "a study from the finished game",
            TimeSpan.FromSeconds(30),
            ct,
            TimeSpan.FromMilliseconds(500));

        Assert.True(study!.Mine);
        Assert.Equal("Qh4#", study.Tree[0].Children[0].Children[0].Children[0].San);
    }
}
