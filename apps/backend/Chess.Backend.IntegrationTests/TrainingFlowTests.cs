using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Chess.Backend.Analysis;
using Chess.Backend.Data;
using Chess.Backend.Data.Models;
using Chess.Backend.Games;
using Chess.Backend.IntegrationTests.Fixtures;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// training end to end on Postgres and Redpanda: an admin imports a master game, the engine's evaluations of its
/// positions are already in the shared cache (no engine needed), the miner singleton finds its critical moments, and a
/// member trains one through the API — the master's move is right even where the engine prefers another.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class TrainingFlowTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);

    /// <summary>24 plies nobody else imports: from ply 20 (Training:MinPly) on, every position has a next move.</summary>
    private static readonly string[] Moves =
    [
        "a2a3", "a7a6", "h2h3", "h7h6", "b2b3", "b7b6", "g2g3", "g7g6", "c2c3", "c7c6", "f2f3", "f7f6",
        "d2d3", "d7d6", "e2e3", "e7e6", "a3a4", "a6a5", "h3h4", "h6h5", "b3b4", "b6b5", "g3g4", "g6g5",
    ];

    private sealed record ImportItem(string Status, Guid? GameId);

    private sealed record ImportAnswer(int Imported, IReadOnlyList<ImportItem> Items);

    private sealed record Item(string Id, string Mode, string Fen, string SideToMove, int? Box);

    private sealed record Next(Item? Item, int Pool);

    private sealed record Source(string Kind, Guid LibraryGameId, string White, string Black, string? Event, int? Year, int Ply);

    private sealed record Answer(bool Correct, string Verdict, string? MasterUci, IReadOnlyList<string> AcceptedUci, IReadOnlyList<string> BestLine, Source Source, int Box, bool Learned);

    private sealed record LibraryCounts(int Pool, int Seen, int Learned, int Due);

    private sealed record Summary(LibraryCounts Library);

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

    private static async Task<T> ReadAsync<T>(HttpClient client, HttpRequestMessage req, CancellationToken ct)
    {
        using HttpResponseMessage r = await client.SendAsync(req, ct);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<T>(Api.Json, ct))!;
    }

    private static async Task<HttpStatusCode> StatusAsync(HttpClient client, HttpRequestMessage req, CancellationToken ct)
    {
        using HttpResponseMessage r = await client.SendAsync(req, ct);
        return r.StatusCode;
    }

    /// <summary>
    /// The engine's verdict on the position after <paramref name="ply"/> moves: a quiet move (h-pawn or a-pawn shuffles
    /// aside) far ahead of the master's, so the master's move is right only as the master's.
    /// </summary>
    private static PositionEvaluation Evaluation(int ply, DateTimeOffset now)
    {
        string fen = ChessRules.Replay(Moves[..ply]).Fen;
        int sign = ply % 2 == 0 ? 1 : -1; // scores are White's
        string best = ply % 2 == 0 ? "e1e2" : "e8e7";
        EvaluationLine[] lines = [new(sign * 300, null, [best, Moves[ply]]), new(sign * -100, null, [Moves[ply]])];
        return new PositionEvaluation
        {
            PositionKey = PositionKey.Of(fen)!,
            ThinkMs = 10_000, // a longer think than the review's serves it, and never meets the miner's own request rows
            Status = PositionEvaluation.Done,
            Depth = 20,
            Lines = JsonSerializer.Serialize(lines),
            RequestedAt = now,
            EvaluatedAt = now,
        };
    }

    [Fact]
    public async Task A_mined_critical_moment_is_trained_and_the_masters_move_is_right()
    {
        ArgumentNullException.ThrowIfNull(stack);
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string run = Guid.NewGuid().ToString("N")[..8];
        string master = $"Shuffler-{run}, Pat";
        string member = $"trainee-{run}";

        object batch = new
        {
            source = "Test",
            licence = "moves only (facts)",
            sourceRef = "training.pgn",
            worldChampionship = false,
            games = new[]
            {
                new
                {
                    white = master,
                    black = "Mirror, Max",
                    @event = "Training test",
                    site = "?",
                    round = "?",
                    date = "1999.01.01",
                    result = "1/2-1/2",
                    eco = (string?)null,
                    moves = Moves,
                    startFen = (string?)null,
                },
            },
        };
        HttpRequestMessage import = As(HttpMethod.Post, "/api/admin/library/import", $"admin-{run}", batch);
        import.Headers.Add(PingApiFactory.RolesHeader, "Admin");
        ImportAnswer imported = await ReadAsync<ImportAnswer>(client, import, ct);
        Assert.Equal(1, imported.Imported);
        Guid gameId = imported.Items[0].GameId!.Value;

        // The engine's answers are already cached: the miner asks for nothing and judges on its next round.
        using (IServiceScope scope = app.Services.CreateScope())
        {
            ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
            DateTimeOffset now = DateTimeOffset.UtcNow;
            for (int at = 20; at < Moves.Length; at++)
            {
                db.PositionEvaluations.Add(Evaluation(at, now));
            }

            await db.SaveChangesAsync(ct);
        }

        await Api.ProvisionAsync(client, member, ct);
        string query = $"/api/training/next?mode=library&player={Uri.EscapeDataString($"shuffler-{run}")}&phase=middlegame&from=1999&to=1999";
        Next? next = null;
        await Api.EventuallyAsync(
            async () => (next = await ReadAsync<Next>(client, As(HttpMethod.Get, query, member), ct)).Item is not null,
            "a critical moment of the imported game",
            TimeSpan.FromSeconds(60),
            ct,
            TimeSpan.FromMilliseconds(500));
        Item item = next!.Item!;
        Assert.Equal("library", item.Mode);
        Assert.Null(item.Box);
        Assert.StartsWith("p:", item.Id, StringComparison.Ordinal);
        Assert.InRange(next.Pool, 1, 3); // at most Training:PerGame of one game

        // The master's move: right, though the engine prefers the king's step.
        string fenKey = PositionKey.Of(item.Fen)!;
        int ply = Enumerable.Range(20, Moves.Length - 20).Single(p => PositionKey.Of(ChessRules.Replay(Moves[..p]).Fen) == fenKey);
        Answer right = await ReadAsync<Answer>(client, As(HttpMethod.Post, "/api/training/answer", member, new { mode = "library", id = item.Id, uci = Moves[ply] }), ct);
        Assert.Equal((true, "master", Moves[ply], 1), (right.Correct, right.Verdict, right.MasterUci, right.Box));
        Assert.Equal(("library", gameId, master, ply), (right.Source.Kind, right.Source.LibraryGameId, right.Source.White, right.Source.Ply));
        Assert.Equal([ply % 2 == 0 ? "e1e2" : "e8e7"], right.AcceptedUci);

        Answer engine = await ReadAsync<Answer>(client, As(HttpMethod.Post, "/api/training/answer", member, new { mode = "library", id = item.Id, uci = right.AcceptedUci[0] }), ct);
        Assert.Equal((true, "engine", 2), (engine.Correct, engine.Verdict, engine.Box));
        Answer wrong = await ReadAsync<Answer>(client, As(HttpMethod.Post, "/api/training/answer", member, new { mode = "library", id = item.Id, uci = "a1a2" }), ct);
        Assert.Equal((false, "none", 0), (wrong.Correct, wrong.Verdict, wrong.Box));

        // Due now after the wrong answer: offered first; excluded, it is not.
        Assert.Equal(item.Id, (await ReadAsync<Next>(client, As(HttpMethod.Get, query, member), ct)).Item!.Id);
        Next other = await ReadAsync<Next>(client, As(HttpMethod.Get, $"{query}&exclude={item.Id}", member), ct);
        Assert.NotEqual(item.Id, other.Item?.Id);

        Assert.Equal(HttpStatusCode.BadRequest, await StatusAsync(client, As(HttpMethod.Get, "/api/training/next?mode=library&exclude=g:1", member), ct));
        Assert.Equal(HttpStatusCode.BadRequest, await StatusAsync(client, As(HttpMethod.Post, "/api/training/answer", member, new { mode = "library", id = item.Id, uci = "e2" }), ct));
        Assert.Equal(HttpStatusCode.NotFound, await StatusAsync(client, As(HttpMethod.Post, "/api/training/answer", member, new { mode = "library", id = $"p:{Guid.NewGuid():N}", uci = "e2e4" }), ct));

        Summary summary = await ReadAsync<Summary>(client, As(HttpMethod.Get, "/api/training/summary", member), ct);
        Assert.Equal((1, 0, 1), (summary.Library.Seen, summary.Library.Learned, summary.Library.Due));
        Assert.True(summary.Library.Pool >= 1);
    }
}
