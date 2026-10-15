using System.Net;
using System.Net.Http.Json;
using Chess.Backend.Authentication;
using Chess.Backend.IntegrationTests.Fixtures;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// Club members end to end on real Postgres (club-members, member-admin): presence through the relay's reports on
/// <c>user:</c> topics, challenges accepted, declined and expired, and member admin against a fake Keycloak (there is
/// none in this suite; the admin API client itself is unit-tested against a fake HTTP handler).
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class ClubMembersFlowTests(StackFixture stack)
{
    private const string Instance = "it-bff";
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(3);

    private sealed record Member(long Id, string Username, string State, DateTimeOffset? LastSeenAt);

    private sealed record Members(IReadOnlyList<Member> Items, bool PresenceKnown, long Seq);

    private sealed record Invite(Guid InviteId, long CreatorId, string TimeControl, string Color, string Status, Guid? GameId, long Seq, long? ForId, string Kind);

    private sealed record ChallengeItem(Guid InviteId, long FromId, string From, string TimeControl, string Color, DateTimeOffset ExpiresAt);

    private sealed record UserView(long UserId, long Seq, IReadOnlyList<ChallengeItem> Challenges);

    private sealed record UserFrame(string Topic, long Seq, UserView Payload);

    private sealed record InviteFrame(string Topic, long Seq, Invite Payload);

    private sealed record Game(Guid GameId, long WhiteId, long BlackId, string TimeControl, string Status);

    private sealed record Problem(IReadOnlyList<ProblemError>? Errors);

    private sealed record ProblemError(string Reason);

    private sealed record AdminMember(long Id, string Username, string? FullName, string? Email, bool Active, bool Admin);

    private sealed record Created(AdminMember Member, string TemporaryPassword);

    [Fact]
    public async Task A_challenge_to_an_online_member_is_accepted_into_a_game_with_the_challengers_colour()
    {
        _ = stack;
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string run = Guid.NewGuid().ToString("N")[..8];
        long ann = await Api.ProvisionAsync(client, $"it-ann-{run}", ct);
        long bob = await Api.ProvisionAsync(client, $"it-bob-{run}", ct);

        await using HubConnection hub = app.ConnectHub("Relay");
        List<UserFrame> bobFrames = [];
        hub.On<UserFrame>("frame", f =>
        {
            if (f.Topic == $"user:{bob}")
            {
                lock (bobFrames)
                {
                    bobFrames.Add(f);
                }
            }
        });
        await hub.StartAsync(ct);
        await using Refresher online = new(hub, [ann, bob], ct);
        UserFrame? snapshot = await hub.InvokeAsync<UserFrame?>("Subscribe", $"user:{bob}", ct);
        Assert.Empty(snapshot!.Payload.Challenges);
        await Api.EventuallyAsync(async () => (await MembersAsync(client, $"it-ann-{run}", ct)).Items.Any(m => m.Id == bob && m.State == "online"), "Bob online", TimeSpan.FromSeconds(15), ct);

        Invite open = await ReadAsync<Invite>(
            await SendAsync(client, HttpMethod.Post, "/api/challenges", $"it-ann-{run}", new { opponentId = bob, timeControl = "5+3", color = "white" }, ct), HttpStatusCode.OK, ct);
        Assert.Equal(("challenge", "open", (long?)bob), (open.Kind, open.Status, open.ForId));
        await Api.EventuallyAsync(
            () => Task.FromResult(Locked(bobFrames, fs => fs.Any(f => f.Payload.Challenges.Any(c => c.InviteId == open.InviteId && c.FromId == ann)))),
            "the challenge on Bob's topic", TimeSpan.FromSeconds(10), ct);

        // A second challenge to Bob, or a second one out from Ann, is refused while this one is open.
        Assert.Equal("You already have a challenge out.", await ErrorAsync(await SendAsync(client, HttpMethod.Post, "/api/challenges", $"it-ann-{run}", new { opponentId = bob, timeControl = "3+2", color = "black" }, ct), HttpStatusCode.Conflict, ct));
        Assert.Equal(HttpStatusCode.Forbidden, (await SendAsync(client, HttpMethod.Post, $"/api/challenges/{open.InviteId:N}/accept", $"it-ann-{run}", null, ct)).StatusCode);

        Invite accepted = await ReadAsync<Invite>(await SendAsync(client, HttpMethod.Post, $"/api/challenges/{open.InviteId:N}/accept", $"it-bob-{run}", null, ct), HttpStatusCode.OK, ct);
        Assert.Equal("accepted", accepted.Status);
        Game game = await ReadAsync<Game>(await Api.GetAsync(client, $"/api/games/{accepted.GameId:N}/live", $"it-bob-{run}", ct), HttpStatusCode.OK, ct);
        Assert.Equal((ann, bob, "5+3"), (game.WhiteId, game.BlackId, game.TimeControl));

        await Api.EventuallyAsync(
            () => Task.FromResult(Locked(bobFrames, fs => fs.Count > 0 && fs.MaxBy(f => f.Seq)!.Payload.Challenges.Count == 0)),
            "Bob's banner cleared", TimeSpan.FromSeconds(10), ct);
        await Api.EventuallyAsync(
            async () => (await MembersAsync(client, $"it-ann-{run}", ct)).Items.Where(m => m.Id == ann || m.Id == bob).All(m => m.State == "playing"),
            "both playing", TimeSpan.FromSeconds(10), ct);
        Assert.Equal($"it-bob-{run} is playing.", await ErrorAsync(
            await SendAsync(client, HttpMethod.Post, "/api/challenges", $"it-ann-{run}", new { opponentId = bob, timeControl = "5+3", color = "random" }, ct), HttpStatusCode.Conflict, ct));
    }

    [Fact]
    public async Task A_declined_challenge_and_an_unanswered_one_are_pushed_to_the_challenger()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        await using PingApiFactory app = new();
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string run = Guid.NewGuid().ToString("N")[..8];
        long ann = await Api.ProvisionAsync(client, $"it-ann-{run}", ct);
        long bob = await Api.ProvisionAsync(client, $"it-bob-{run}", ct);
        long cid = await Api.ProvisionAsync(client, $"it-cid-{run}", ct);

        Assert.Equal($"it-cid-{run} is offline.", await ErrorAsync(
            await SendAsync(client, HttpMethod.Post, "/api/challenges", $"it-ann-{run}", new { opponentId = cid, timeControl = "5+3", color = "white" }, ct), HttpStatusCode.Conflict, ct));
        Assert.Equal("You cannot challenge yourself.", await ErrorAsync(
            await SendAsync(client, HttpMethod.Post, "/api/challenges", $"it-ann-{run}", new { opponentId = ann, timeControl = "5+3", color = "white" }, ct), HttpStatusCode.Conflict, ct));
        Assert.Equal(HttpStatusCode.BadRequest, (await SendAsync(client, HttpMethod.Post, "/api/challenges", $"it-ann-{run}", new { opponentId = bob, timeControl = "4+2", color = "white" }, ct)).StatusCode);

        await using HubConnection hub = app.ConnectHub("Relay");
        List<InviteFrame> frames = [];
        hub.On<InviteFrame>("frame", f =>
        {
            if (f.Topic.StartsWith("invite:", StringComparison.Ordinal))
            {
                lock (frames)
                {
                    frames.Add(f);
                }
            }
        });
        await hub.StartAsync(ct);
        await using Refresher online = new(hub, [bob], ct);
        await Api.EventuallyAsync(async () => (await MembersAsync(client, $"it-ann-{run}", ct)).Items.Any(m => m.Id == bob && m.State == "online"), "Bob online", TimeSpan.FromSeconds(15), ct);

        // Declined.
        Invite first = await ReadAsync<Invite>(
            await SendAsync(client, HttpMethod.Post, "/api/challenges", $"it-ann-{run}", new { opponentId = bob, timeControl = "3+2", color = "black" }, ct), HttpStatusCode.OK, ct);
        await hub.InvokeAsync<InviteFrame?>("Subscribe", $"invite:{first.InviteId:N}", ct);
        Invite declined = await ReadAsync<Invite>(await SendAsync(client, HttpMethod.Post, $"/api/challenges/{first.InviteId:N}/decline", $"it-bob-{run}", null, ct), HttpStatusCode.OK, ct);
        Assert.Equal("declined", declined.Status);
        await Api.EventuallyAsync(() => Task.FromResult(Locked(frames, fs => fs.Any(f => f.Payload.InviteId == first.InviteId && f.Payload.Status == "declined"))), "the declined frame", TimeSpan.FromSeconds(10), ct);
        Assert.Equal(HttpStatusCode.Conflict, (await SendAsync(client, HttpMethod.Post, $"/api/challenges/{first.InviteId:N}/accept", $"it-bob-{run}", null, ct)).StatusCode);

        // Unanswered: the timer ends it after a minute, and Ann may challenge again.
        Invite second = await ReadAsync<Invite>(
            await SendAsync(client, HttpMethod.Post, "/api/challenges", $"it-ann-{run}", new { opponentId = bob, timeControl = "3+2", color = "white" }, ct), HttpStatusCode.OK, ct);
        await hub.InvokeAsync<InviteFrame?>("Subscribe", $"invite:{second.InviteId:N}", ct);
        await Api.EventuallyAsync(
            () => Task.FromResult(Locked(frames, fs => fs.Any(f => f.Payload.InviteId == second.InviteId && f.Payload.Status == "expired"))),
            "the expired frame", TimeSpan.FromSeconds(75), ct, TimeSpan.FromSeconds(1));
        Invite third = await ReadAsync<Invite>(
            await SendAsync(client, HttpMethod.Post, "/api/challenges", $"it-ann-{run}", new { opponentId = bob, timeControl = "3+2", color = "white" }, ct), HttpStatusCode.OK, ct);
        Assert.Equal("cancelled", (await ReadAsync<Invite>(await SendAsync(client, HttpMethod.Post, $"/api/challenges/{third.InviteId:N}/cancel", $"it-ann-{run}", null, ct), HttpStatusCode.OK, ct)).Status);
    }

    [Fact]
    public async Task An_admin_creates_a_member_who_is_listed_at_once_and_deactivating_them_signs_them_out()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        FakeKeycloakAdmin keycloak = new();
        await using PingApiFactory app = new(services => services.AddSingleton<IKeycloakAdmin>(keycloak));
        using HttpClient client = await app.CreateReadyClientAsync(ct);
        string run = Guid.NewGuid().ToString("N")[..8];
        string admin = $"it-admin-{run}";
        long adminId = await Api.ProvisionAsync(client, admin, ct);

        Assert.Equal(HttpStatusCode.Forbidden, (await SendAsync(client, HttpMethod.Get, "/api/admin/members", admin, null, ct)).StatusCode);

        Created created = await ReadAsync<Created>(
            await SendAsync(client, HttpMethod.Post, "/api/admin/members", admin, new { username = $"carol-{run}", fullName = "Carol Smith", email = (string?)null }, ct, roles: "Admin"), HttpStatusCode.OK, ct);
        Assert.Equal(16, created.TemporaryPassword.Length);
        Assert.Equal(($"carol-{run}", "Carol Smith", true, false), (created.Member.Username, created.Member.FullName, created.Member.Active, created.Member.Admin));
        Assert.Contains((await MembersAsync(client, admin, ct)).Items, m => m.Id == created.Member.Id && m.State == "offline");
        Assert.Equal("That username is taken.", await ErrorAsync(
            await SendAsync(client, HttpMethod.Post, "/api/admin/members", admin, new { username = $"carol-{run}", fullName = "Carol Again" }, ct, roles: "Admin"), HttpStatusCode.Conflict, ct));

        // Carol signs in (her Keycloak id is her sub) and is the row the admin made.
        string carol = keycloak.IdOf($"carol-{run}");
        Assert.Equal(created.Member.Id, await Api.ProvisionAsync(client, carol, ct));

        AdminMember deactivated = await ReadAsync<AdminMember>(
            await SendAsync(client, HttpMethod.Post, $"/api/admin/members/{created.Member.Id}/deactivate", admin, null, ct, roles: "Admin"), HttpStatusCode.OK, ct);
        Assert.False(deactivated.Active);
        Assert.False(keycloak.Enabled[carol]);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Api.GetAsync(client, "/api/me", carol, ct)).StatusCode);
        Assert.DoesNotContain((await MembersAsync(client, admin, ct)).Items, m => m.Id == created.Member.Id);

        await ReadAsync<AdminMember>(await SendAsync(client, HttpMethod.Post, $"/api/admin/members/{created.Member.Id}/reactivate", admin, null, ct, roles: "Admin"), HttpStatusCode.OK, ct);
        Assert.Equal(HttpStatusCode.OK, (await Api.GetAsync(client, "/api/me", carol, ct)).StatusCode);

        Assert.Equal("You cannot do that to yourself.", await ErrorAsync(
            await SendAsync(client, HttpMethod.Post, $"/api/admin/members/{adminId}/deactivate", admin, null, ct, roles: "Admin"), HttpStatusCode.BadRequest, ct));

        keycloak.Down = true;
        Assert.Equal(HttpStatusCode.BadGateway, (await SendAsync(client, HttpMethod.Post, $"/api/admin/members/{created.Member.Id}/deactivate", admin, null, ct, roles: "Admin")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Api.GetAsync(client, "/api/me", carol, ct)).StatusCode); // nothing changed
    }

    private static bool Locked<T>(List<T> list, Func<List<T>, bool> test)
    {
        lock (list)
        {
            return test(list);
        }
    }

    private static async Task<Members> MembersAsync(HttpClient client, string subject, CancellationToken ct) =>
        await ReadAsync<Members>(await Api.GetAsync(client, "/api/members", subject, ct), HttpStatusCode.OK, ct);

    private static Task<HttpResponseMessage> SendAsync(HttpClient client, HttpMethod method, string url, string subject, object? body, CancellationToken ct, string? roles = null)
    {
        HttpRequestMessage req = new(method, url) { Content = body is null ? null : JsonContent.Create(body, options: Api.Json) };
        req.Headers.Add(PingApiFactory.SubjectHeader, subject);
        if (roles is not null)
        {
            req.Headers.Add(PingApiFactory.RolesHeader, roles);
        }

        return client.SendAsync(req, ct);
    }

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response, HttpStatusCode expected, CancellationToken ct)
    {
        using (response)
        {
            Assert.True(expected == response.StatusCode, $"{expected} expected, got {response.StatusCode}: {await response.Content.ReadAsStringAsync(ct)}");
            return (await response.Content.ReadFromJsonAsync<T>(Api.Json, ct))!;
        }
    }

    /// <summary>The first error's words, as the BFF's <c>postCommand</c> shows them.</summary>
    private static async Task<string> ErrorAsync(HttpResponseMessage response, HttpStatusCode expected, CancellationToken ct) =>
        Assert.Single((await ReadAsync<Problem>(response, expected, ct)).Errors!).Reason;

    /// <summary>The BFF's 30 s presence refresh, faster: the suite's lease is a few seconds.</summary>
    private sealed class Refresher : IAsyncDisposable
    {
        private readonly CancellationTokenSource _stop;
        private readonly Task _loop;

        public Refresher(HubConnection hub, long[] users, CancellationToken ct)
        {
            _stop = CancellationTokenSource.CreateLinkedTokenSource(ct);
            CancellationToken token = _stop.Token;
            _loop = Task.Run(async () =>
            {
                while (!token.IsCancellationRequested)
                {
                    foreach (long user in users)
                    {
                        await hub.InvokeAsync("Present", $"user:{user}", user, Instance, token);
                    }

                    await Task.Delay(TimeSpan.FromSeconds(1), token);
                }
            }, token);
        }

        public async ValueTask DisposeAsync()
        {
            await _stop.CancelAsync();
            try
            {
                await _loop;
            }
            catch (OperationCanceledException)
            {
                // stopped
            }

            _stop.Dispose();
        }
    }

    /// <summary>Keycloak's admin API as this suite needs it: users by id, enabled or not, and an outage switch.</summary>
    internal sealed class FakeKeycloakAdmin : IKeycloakAdmin
    {
        private readonly Dictionary<string, string> _ids = new(StringComparer.Ordinal);

        public Dictionary<string, bool> Enabled { get; } = new(StringComparer.Ordinal);

        public HashSet<string> Admins { get; } = new(StringComparer.Ordinal);

        public bool Down { get; set; }

        public string IdOf(string username)
        {
            lock (_ids)
            {
                return _ids[username];
            }
        }

        public Task<string> CreateUserAsync(NewKeycloakUser user, CancellationToken ct)
        {
            Check();
            lock (_ids)
            {
                if (_ids.ContainsKey(user.Username))
                {
                    throw new KeycloakAdminException("That username is taken.", HttpStatusCode.Conflict);
                }

                string id = $"it-kc-{Guid.NewGuid():N}";
                _ids[user.Username] = id;
                Enabled[id] = true;
                return Task.FromResult(id);
            }
        }

        public Task SetEnabledAsync(string userId, bool enabled, CancellationToken ct)
        {
            Check();
            Enabled[userId] = enabled;
            return Task.CompletedTask;
        }

        public Task ResetPasswordAsync(string userId, string temporaryPassword, CancellationToken ct)
        {
            Check();
            return Task.CompletedTask;
        }

        public Task SetAdminAsync(string userId, bool admin, CancellationToken ct)
        {
            Check();
            if (admin)
            {
                Admins.Add(userId);
            }
            else
            {
                Admins.Remove(userId);
            }

            return Task.CompletedTask;
        }

        public Task<bool> IsAdminAsync(string userId, CancellationToken ct)
        {
            Check();
            return Task.FromResult(Admins.Contains(userId));
        }

        public Task<IReadOnlySet<string>> AdminIdsAsync(CancellationToken ct)
        {
            Check();
            return Task.FromResult<IReadOnlySet<string>>(new HashSet<string>(Admins, StringComparer.Ordinal));
        }

        private void Check()
        {
            if (Down)
            {
                throw new KeycloakAdminException("connection refused");
            }
        }
    }
}
