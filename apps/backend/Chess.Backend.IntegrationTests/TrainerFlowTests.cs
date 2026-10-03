using System.Net;
using System.Net.Http.Json;
using Chess.Backend.IntegrationTests.Fixtures;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// opening-trainer end to end on Postgres with the real opening list (seeded at startup): a member's missed line is
/// offered first, three clean runs learn a line, the families and the member's own list count it, and progress is the
/// member's alone.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class TrainerFlowTests(StackFixture stack)
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(2);

    private sealed record Line(string Key, string Name, IReadOnlyList<string> Moves, int? Box);

    private sealed record Next(Line? Line, DateTimeOffset? NextDueAt);

    private sealed record Family(string Name, int Lines, int Learned);

    private sealed record Run(string LineKey, int Box, bool Learned);

    private sealed record Trained(string Name, string Color, int Lines, int Learned);

    private static async Task<HttpResponseMessage> PostAsync(HttpClient client, string who, object body, CancellationToken ct)
    {
        using HttpRequestMessage request = new(HttpMethod.Post, "/api/trainer/results") { Content = JsonContent.Create(body) };
        request.Headers.Add(PingApiFactory.SubjectHeader, who);
        return await client.SendAsync(request, ct);
    }

    [Fact]
    public async Task A_member_trains_a_family_and_the_schedule_follows()
    {
        ArgumentNullException.ThrowIfNull(stack);
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string me = $"trainee-{Guid.NewGuid():N}"[..20];
        const string family = "Ruy Lopez: Berlin Defense";
        string query = $"name={Uri.EscapeDataString(family)}&color=black";

        List<Line> lines;
        using (HttpResponseMessage r = await Api.GetAsync(client, $"/api/trainer/family?{query}", me, ct))
        {
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            lines = (await r.Content.ReadFromJsonAsync<List<Line>>(Api.Json, ct))!;
        }

        Assert.True(lines.Count > 1);
        Assert.All(lines, l => Assert.Null(l.Box));
        // Each line is its own move order (some reach the Berlin by transposition, e.g. the Tarrasch Trap).
        Assert.All(lines, l => Assert.Equal("e2e4", l.Moves[0]));

        // Miss the second line: it comes back before the first, never-trained one.
        using (HttpResponseMessage r = await PostAsync(client, me, new { lineKey = lines[1].Key, color = "black", mistakes = 1 }, ct))
        {
            Assert.Equal(0, (await r.Content.ReadFromJsonAsync<Run>(Api.Json, ct))!.Box);
        }

        using (HttpResponseMessage r = await Api.GetAsync(client, $"/api/trainer/next?{query}", me, ct))
        {
            Assert.Equal(lines[1].Key, (await r.Content.ReadFromJsonAsync<Next>(Api.Json, ct))!.Line!.Key);
        }

        // Three clean runs: learned.
        Run? last = null;
        for (int i = 0; i < 3; i++)
        {
            using HttpResponseMessage r = await PostAsync(client, me, new { lineKey = lines[0].Key, color = "black", mistakes = 0 }, ct);
            last = await r.Content.ReadFromJsonAsync<Run>(Api.Json, ct);
        }

        Assert.Equal((3, true), (last!.Box, last.Learned));
        using (HttpResponseMessage r = await Api.GetAsync(client, "/api/trainer/families?q=berlin&color=black", me, ct))
        {
            Family berlin = Assert.Single((await r.Content.ReadFromJsonAsync<List<Family>>(Api.Json, ct))!, f => f.Name == family);
            Assert.Equal(1, berlin.Learned);
        }

        using (HttpResponseMessage r = await Api.GetAsync(client, "/api/me/trainer", me, ct))
        {
            Trained ruy = Assert.Single((await r.Content.ReadFromJsonAsync<List<Trained>>(Api.Json, ct))!);
            Assert.Equal(("Ruy Lopez", "black", 1), (ruy.Name, ruy.Color, ruy.Learned));
        }

        // Someone else sees none of it.
        using (HttpResponseMessage r = await Api.GetAsync(client, "/api/me/trainer", $"other-{me}", ct))
        {
            Assert.Empty((await r.Content.ReadFromJsonAsync<List<Trained>>(Api.Json, ct))!);
        }

        using (HttpResponseMessage r = await PostAsync(client, me, new { lineKey = "not a line", color = "black", mistakes = 0 }, ct))
        {
            Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
        }
    }
}
