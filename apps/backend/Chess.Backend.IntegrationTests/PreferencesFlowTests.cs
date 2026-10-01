using System.Net;
using System.Net.Http.Json;
using Chess.Backend.IntegrationTests.Fixtures;

namespace Chess.Backend.IntegrationTests;

/// <summary>Display preferences on the account (user-preferences), over HTTP on real Postgres (jsonb).</summary>
[Collection(StackFixture.Collection)]
public sealed class PreferencesFlowTests(StackFixture stack)
{
    private sealed record Prefs(string BoardTheme, string PieceSet, string Animation, bool Coordinates, string SiteTheme);

    [Fact]
    public async Task Preferences_start_as_the_defaults_round_trip_and_refuse_unknown_values()
    {
        _ = stack;
        using CancellationTokenSource cts = new(TimeSpan.FromMinutes(2));
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string user = $"it-prefs-{Guid.NewGuid():N}"[..20];
        await Api.ProvisionAsync(client, user, ct);

        Assert.Equal(new Prefs("brown", "cburnett", "normal", true, "dark"), await GetAsync(client, user, ct));

        Prefs blue = new("blue", "cburnett", "fast", false, "dark");
        using (HttpResponseMessage saved = await PutAsync(client, user, blue, ct))
        {
            Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        }

        Assert.Equal(blue, await GetAsync(client, user, ct));

        using (HttpResponseMessage refused = await PutAsync(client, user, blue with { BoardTheme = "neon" }, ct))
        {
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        }

        Assert.Equal(blue, await GetAsync(client, user, ct));
    }

    private static async Task<Prefs> GetAsync(HttpClient client, string user, CancellationToken ct)
    {
        using HttpResponseMessage response = await Api.GetAsync(client, "/api/me/preferences", user, ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<Prefs>(Api.Json, ct))!;
    }

    private static Task<HttpResponseMessage> PutAsync(HttpClient client, string user, Prefs body, CancellationToken ct)
    {
        HttpRequestMessage req = new(HttpMethod.Put, "/api/me/preferences") { Content = JsonContent.Create(body, options: Api.Json) };
        req.Headers.Add(PingApiFactory.SubjectHeader, user);
        return client.SendAsync(req, ct);
    }
}
