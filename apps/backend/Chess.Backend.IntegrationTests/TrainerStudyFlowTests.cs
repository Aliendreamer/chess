using System.Net;
using System.Net.Http.Json;
using Chess.Backend.IntegrationTests.Fixtures;
using Npgsql;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// study-repertoire-trainer on real Postgres: a member drills their own study's two lines (one clean, one missed),
/// reorders the variations (progress kept), extends a line (that line starts over, its old key is refused), and deletes
/// the study (its progress rows go with it); another member cannot see the drill.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class TrainerStudyFlowTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);

    private sealed record Created(Guid Id, string Title);

    private sealed record Import(List<Created> Created, List<object> Refused);

    private sealed record Study(Guid Id, long Version);

    private sealed record Line(string Key, List<string> Moves, int? Box);

    private sealed record Drill(Guid Id, string Title, List<Line> Lines);

    private sealed record Next(Line? Line, DateTimeOffset? NextDueAt);

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
        using (req)
        {
            using HttpResponseMessage r = await client.SendAsync(req, ct);
            Assert.Equal(expected, r.StatusCode);
            return (await r.Content.ReadFromJsonAsync<T>(Api.Json, ct))!;
        }
    }

    private static async Task<HttpStatusCode> StatusAsync(HttpClient client, HttpRequestMessage req, CancellationToken ct)
    {
        using (req)
        {
            using HttpResponseMessage r = await client.SendAsync(req, ct);
            return r.StatusCode;
        }
    }

    private static object M(string uci, params object[] children) => new { uci, children };

    [Fact]
    public async Task A_member_drills_their_study_and_edits_keep_or_reset_its_lines()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string ann = Api.NewId("it-ta");
        string bob = Api.NewId("it-tb");
        await Api.ProvisionAsync(client, ann, ct);
        await Api.ProvisionAsync(client, bob, ct);

        // 1.e4 e5 2.Nf3 (2.f4): two lines as White.
        Import import = await ReadAsync<Import>(client, As(HttpMethod.Post, "/api/studies", ann, new
        {
            studies = new[] { new { title = "My e4", tree = new[] { M("e2e4", M("e7e5", M("g1f3"), M("f2f4"))) } } },
        }), HttpStatusCode.Created, ct);
        Guid id = Assert.Single(import.Created).Id;
        string drillUrl = $"/api/trainer/studies/{id:N}?color=white";

        Drill drill = await ReadAsync<Drill>(client, As(HttpMethod.Get, drillUrl, ann), HttpStatusCode.OK, ct);
        Assert.Equal(2, drill.Lines.Count);
        Assert.Equal(HttpStatusCode.NotFound, await StatusAsync(client, As(HttpMethod.Get, drillUrl, bob), ct));

        Next first = await ReadAsync<Next>(client, As(HttpMethod.Get, $"/api/trainer/studies/{id:N}/next?color=white", ann), HttpStatusCode.OK, ct);
        Assert.Equal(["e2e4", "e7e5", "g1f3"], first.Line!.Moves);
        await ReadAsync<object>(client, As(HttpMethod.Post, $"/api/trainer/studies/{id:N}/results", ann, new { lineKey = first.Line.Key, color = "white", mistakes = 0 }), HttpStatusCode.OK, ct);
        string f4 = drill.Lines.Single(l => l.Moves[^1] == "f2f4").Key;
        await ReadAsync<object>(client, As(HttpMethod.Post, $"/api/trainer/studies/{id:N}/results", ann, new { lineKey = f4, color = "white", mistakes = 1 }), HttpStatusCode.OK, ct);

        // Promote 2.f4: both lines keep their progress.
        Study study = await ReadAsync<Study>(client, As(HttpMethod.Get, $"/api/studies/{id:N}", ann), HttpStatusCode.OK, ct);
        study = await ReadAsync<Study>(client, As(HttpMethod.Put, $"/api/studies/{id:N}", ann, new
        {
            title = "My e4",
            tree = new[] { M("e2e4", M("e7e5", M("f2f4"), M("g1f3"))) },
            version = study.Version,
        }), HttpStatusCode.OK, ct);
        drill = await ReadAsync<Drill>(client, As(HttpMethod.Get, drillUrl, ann), HttpStatusCode.OK, ct);
        Assert.Equal([(f4, (int?)0), (first.Line.Key, (int?)1)], drill.Lines.Select(l => (l.Key, l.Box)));

        // Extend 2.Nf3 with 2...Nc6: that line is new (never trained) and its old key is refused.
        await ReadAsync<Study>(client, As(HttpMethod.Put, $"/api/studies/{id:N}", ann, new
        {
            title = "My e4",
            tree = new[] { M("e2e4", M("e7e5", M("f2f4"), M("g1f3", M("b8c6")))) },
            version = study.Version,
        }), HttpStatusCode.OK, ct);
        drill = await ReadAsync<Drill>(client, As(HttpMethod.Get, drillUrl, ann), HttpStatusCode.OK, ct);
        Assert.Equal([(int?)0, null], drill.Lines.Select(l => l.Box));
        Assert.Equal(
            HttpStatusCode.NotFound,
            await StatusAsync(client, As(HttpMethod.Post, $"/api/trainer/studies/{id:N}/results", ann, new { lineKey = first.Line.Key, color = "white", mistakes = 0 }), ct));
        Assert.Equal(1, await ProgressRowsAsync(id, ct));

        // Delete the study: its progress goes with it.
        Assert.Equal(HttpStatusCode.NoContent, await StatusAsync(client, As(HttpMethod.Delete, $"/api/studies/{id:N}", ann), ct));
        Assert.Equal(0, await ProgressRowsAsync(id, ct));
    }

    private async Task<long> ProgressRowsAsync(Guid studyId, CancellationToken ct)
    {
        await using NpgsqlConnection connection = new(stack.PostgresConnectionString);
        await connection.OpenAsync(ct);
        await using NpgsqlCommand count = new("""select count(*) from trainer_progress where "StudyId" = @id""", connection);
        count.Parameters.AddWithValue("id", studyId);
        return (long)(await count.ExecuteScalarAsync(ct))!;
    }
}
