using System.Globalization;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Extensions;
using Chess.Backend.Games;
using Chess.Backend.Messaging;

namespace Chess.Backend.Akka.Presence;

// Messages of the presence singleton (club-members D1, D2).

/// <summary>The BFF's report for a member's own <c>user:{id}</c> topic, per BFF instance; re-sent every 30 s as a lease.</summary>
internal sealed record ReportUserPresence(long UserId, string Instance, bool Present);

/// <summary>Everyone's state, as of now: the members list asks this (and loads when it does not answer).</summary>
internal sealed record GetPresence
{
    public static readonly GetPresence Instance = new();
}

/// <summary>The <c>members:all</c> snapshot: the singleton reads the active members and answers a <see cref="MembersView"/>.</summary>
internal sealed record GetMembersView
{
    public static readonly GetMembersView Instance = new();
}

/// <summary>The <c>user:{id}</c> snapshot: the open challenges to that member, as a <see cref="UserView"/>.</summary>
internal sealed record GetUserView(long UserId);

/// <summary>
/// Reserves both ends of a challenge atomically (club-members D2): answered <see cref="ChallengeReserved"/> or
/// <see cref="ChallengeRefused"/>. The reservation shows on the opponent's <c>user:</c> topic once the invite exists
/// (<see cref="ChallengeOpened"/>), and lasts until <see cref="ReleaseChallenge"/> or its expiry.
/// </summary>
internal sealed record TryReserveChallenge(Guid InviteId, long FromId, string FromName, long ToId, string TimeControl, string Color);

internal sealed record ChallengeReserved(Guid InviteId);

internal sealed record ChallengeRefused(ChallengeRefusal Reason);

/// <summary>Why a challenge cannot be made; the endpoint turns it into words with the opponent's name.</summary>
internal enum ChallengeRefusal
{
    Self,
    Offline,
    Playing,
    AlreadyChallenged,
    ChallengeOut,
}

/// <summary>The invite behind a reservation exists: it shows on the opponent's topic until it ends.</summary>
internal sealed record ChallengeOpened(Guid InviteId, DateTimeOffset ExpiresAt);

/// <summary>A challenge ended (accepted, declined, cancelled, expired, or never created): both members are free again.</summary>
internal sealed record ReleaseChallenge(Guid InviteId);

/// <summary>A member was deactivated: their leases and challenges go. Answered with the challenges to withdraw.</summary>
internal sealed record DropMember(long UserId);

internal sealed record MemberDropped(IReadOnlyList<Guid> Challenges);

/// <summary>The list itself changed (a member created or reactivated): publish the members frame again.</summary>
internal sealed record RefreshMembers
{
    public static readonly RefreshMembers Instance = new();
}

/// <summary>
/// Published by <c>GameActor</c> on DistributedPubSub topic <see cref="PresenceTopics.PubSub"/> when a game between two
/// people starts or ends (club-members D1): untraced, fire and forget. Games against the computer never publish.
/// </summary>
internal sealed record PlayerGameStarted(Guid GameId, long WhiteId, long BlackId);

internal sealed record PlayerGameEnded(Guid GameId, long WhiteId, long BlackId);

internal static class PresenceTopics
{
    /// <summary>The DistributedPubSub topic games announce their start and end on.</summary>
    public const string PubSub = "presence";
}

/// <summary>A member's state on the members list; lower-case on the wire.</summary>
[System.Text.Json.Serialization.JsonConverter(typeof(WireEnumConverter<MemberState>))]
internal enum MemberState
{
    Online,
    Playing,
    Offline,
}

/// <summary>The singleton's answer to <see cref="GetPresence"/>: who is not offline, and who went offline when.</summary>
internal sealed record PresenceSnapshot(
    IReadOnlyDictionary<long, MemberState> States,
    IReadOnlyDictionary<long, DateTimeOffset> LastSeen,
    long Seq);

/// <summary>One row of <c>GET /api/members</c> and of the <c>members</c> live payload.</summary>
internal sealed record MemberItem(long Id, string Username, MemberState State, DateTimeOffset? LastSeenAt);

/// <summary>
/// <c>GET /api/members</c> and the <c>members:all</c> payload: active members, online and playing first, then by
/// name. <see cref="PresenceKnown"/> is false (and everyone offline) when the singleton did not answer in time.
/// </summary>
internal sealed record MembersView(IReadOnlyList<MemberItem> Items, bool PresenceKnown, long Seq);

/// <summary>One open challenge to a member, on their <c>user:</c> topic; <see cref="Color"/> is the challenger's.</summary>
internal sealed record ChallengeItem(Guid InviteId, long FromId, string From, string TimeControl, string Color, DateTimeOffset ExpiresAt);

/// <summary>The <c>user:{id}</c> payload: the open challenges to <see cref="UserId"/>.</summary>
internal sealed record UserView(long UserId, long Seq, IReadOnlyList<ChallengeItem> Challenges);

/// <summary>An active member as the directory reads it.</summary>
internal sealed record MemberRow(long Id, string Username, DateTimeOffset? LastSeenAt);

/// <summary>A game between two people still being played, for the singleton to know who is playing after a failover.</summary>
internal sealed record LiveGame(Guid GameId, long WhiteId, long BlackId);

internal static class MembersList
{
    /// <summary>
    /// The members list from the directory and the presence (null: unknown, everyone offline). An offline member shows
    /// when they were last seen, the singleton's memory first (it may not be written yet), else the stored time.
    /// </summary>
    public static MembersView Build(IReadOnlyList<MemberRow> rows, PresenceSnapshot? presence)
    {
        ArgumentNullException.ThrowIfNull(rows);
        List<MemberItem> items = [.. rows.Select(r =>
        {
            MemberState state = presence?.States.GetValueOrDefault(r.Id, MemberState.Offline) ?? MemberState.Offline;
            DateTimeOffset? seen = presence?.LastSeen.TryGetValue(r.Id, out DateTimeOffset at) == true && (r.LastSeenAt is null || at > r.LastSeenAt) ? at : r.LastSeenAt;
            return new MemberItem(r.Id, r.Username, state, seen);
        })];
        items.Sort(static (a, b) =>
        {
            int byState = Rank(a.State).CompareTo(Rank(b.State));
            return byState != 0 ? byState : string.Compare(a.Username, b.Username, StringComparison.OrdinalIgnoreCase);
        });
        return new MembersView(items, presence is not null, presence?.Seq ?? 0);
    }

    private static int Rank(MemberState state) => state == MemberState.Offline ? 1 : 0;
}

/// <summary>The singleton's reads and its one write, on the PRIMARY (the replica may lag behind a deactivation).</summary>
internal interface IMemberDirectory
{
    /// <summary>Every active member (engine players excluded), in no particular order.</summary>
    Task<IReadOnlyList<MemberRow>> ActiveMembersAsync(CancellationToken ct);

    /// <summary>Records when a member went offline (club-members D1: once per going offline, not per heartbeat).</summary>
    Task MarkLastSeenAsync(long userId, DateTimeOffset at, CancellationToken ct);

    /// <summary>Games between two people still being played, from <c>rm_games</c>.</summary>
    Task<IReadOnlyList<LiveGame>> LiveGamesAsync(CancellationToken ct);
}

internal sealed class MemberDirectory(IServiceScopeFactory scopes) : IMemberDirectory
{
    public async Task<IReadOnlyList<MemberRow>> ActiveMembersAsync(CancellationToken ct)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        return await ActiveMembersAsync(scope.ServiceProvider.GetRequiredService<ProjectDbContext>(), ct);
    }

    [ExcludeFromCodeCoverage(Justification = "ExecuteUpdate needs a relational provider; proved by the integration suite.")]
    public async Task MarkLastSeenAsync(long userId, DateTimeOffset at, CancellationToken ct)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
        // A plain column write: no audit bump, so it never races an admin's edit on the row's version.
        await db.Users.Where(u => u.Id == userId).ExecuteUpdateAsync(u => u.SetProperty(x => x.LastSeenAt, at), ct);
    }

    public async Task<IReadOnlyList<LiveGame>> LiveGamesAsync(CancellationToken ct)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        return await LiveGamesAsync(scope.ServiceProvider.GetRequiredService<ProjectDbContext>(), ct);
    }

    public static async Task<IReadOnlyList<MemberRow>> ActiveMembersAsync(ProjectDbContext db, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(db);
        return await db.Users.AsNoTracking()
            .Where(u => u.Id > 0 && u.Active)
            .Select(u => new MemberRow(u.Id, DisplayName(u.Id, u.Username), u.LastSeenAt))
            .ToListAsync(ct);
    }

    public static async Task<IReadOnlyList<LiveGame>> LiveGamesAsync(ProjectDbContext db, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(db);
        string untimed = TimeControl.Untimed.ToString();
        return await db.RmGames.AsNoTracking()
            .Where(g => g.Status == RmGame.Playing && g.TimeControl != untimed)
            .Select(g => new LiveGame(g.GameId, g.WhiteId, g.BlackId))
            .ToListAsync(ct);
    }

    /// <summary>A member's name; one who never signed in under a username (only rows from before D23) is shown by number.</summary>
    public static string DisplayName(long id, string? username) =>
        string.IsNullOrEmpty(username) ? "#" + id.ToString(CultureInfo.InvariantCulture) : username;
}

/// <summary>The <c>user</c> live kind (club-members D1): <c>user:{id}</c>, the open challenges to that member.</summary>
internal sealed class UserLiveSource(IRequiredActor<PresenceActor> presence, IOptions<ApiOptions> api) : ILiveTopicSource
{
    public const string KindName = "user";

    public string Kind => KindName;

    public bool IsValidId(string id) => TryParseId(id, out _);

    public async Task<LiveFrame?> SnapshotAsync(string id, CancellationToken ct) =>
        TryParseId(id, out long userId)
        && await presence.ActorRef.Ask(ActorTracing.Wrap(new GetUserView(userId)), api.Value.AskTimeout, ct) is UserView view
            ? ToFrame(view)
            : null;

    public static LiveFrame ToFrame(UserView view, string? trace = null)
    {
        ArgumentNullException.ThrowIfNull(view);
        return new LiveFrame(Topic(view.UserId), view.Seq, view, trace);
    }

    public static string Topic(long userId) => LiveTopics.Format(KindName, userId.ToString(CultureInfo.InvariantCulture));

    /// <summary>A positive member id in its plain decimal spelling (no sign, no leading zeros).</summary>
    public static bool TryParseId(string? id, out long userId) =>
        long.TryParse(id, NumberStyles.None, CultureInfo.InvariantCulture, out userId)
        && userId > 0
        && string.Equals(id, userId.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal);
}

/// <summary>The <c>members</c> live kind (club-members D1): one topic, <c>members:all</c>.</summary>
internal sealed class MembersLiveSource(IRequiredActor<PresenceActor> presence, IOptions<ApiOptions> api) : ILiveTopicSource
{
    public const string KindName = "members";
    public const string All = "all";

    public static readonly string Topic = LiveTopics.Format(KindName, All);

    public string Kind => KindName;

    public bool IsValidId(string id) => id == All;

    public async Task<LiveFrame?> SnapshotAsync(string id, CancellationToken ct) =>
        await presence.ActorRef.Ask(ActorTracing.Wrap(GetMembersView.Instance), api.Value.AskTimeout, ct) is MembersView view
            ? new LiveFrame(Topic, view.Seq, view)
            : null;
}

/// <summary>
/// What member admin tells the live side (member-admin D3). <see cref="EvictAsync"/> lets go of a deactivated member:
/// their leases and challenges in the presence singleton, the invites behind those challenges (withdrawn), and their
/// places in the matchmaking queues. <see cref="RefreshList"/> republishes the members frame after the list changed.
/// </summary>
internal interface IMemberEviction
{
    Task EvictAsync(long userId, CancellationToken ct);

    void RefreshList();
}

[ExcludeFromCodeCoverage(Justification = "Actor plumbing; the singleton's DropMember and the invites' withdrawal are unit-tested, the whole by the integration suite.")]
internal sealed class MemberEviction(
    IRequiredActor<PresenceActor> presence,
    IRequiredActor<Matchmaking.InviteActor> invites,
    IRequiredActor<Matchmaking.MatchmakingActor> matchmaking,
    IOptions<ApiOptions> api,
    ILogger<MemberEviction> logger) : IMemberEviction
{
    public async Task EvictAsync(long userId, CancellationToken ct)
    {
        matchmaking.ActorRef.Tell(ActorTracing.Wrap(new Matchmaking.LeaveAllQueues(userId)));
        try
        {
            if (await presence.ActorRef.Ask(ActorTracing.Wrap(new DropMember(userId)), api.Value.AskTimeout, ct) is MemberDropped dropped)
            {
                foreach (Guid invite in dropped.Challenges)
                {
                    invites.ActorRef.Tell(ActorTracing.Wrap(new Matchmaking.CancelChallenge(invite, null)));
                }
            }
        }
        catch (AskTimeoutException e)
        {
            Log.EvictionIncomplete(logger, userId, e.Message);
        }
    }

    public void RefreshList() => presence.ActorRef.Tell(ActorTracing.Wrap(RefreshMembers.Instance));
}

/// <summary>Section <c>Members</c> (club-members D1).</summary>
internal sealed class MembersOptions : ISettings
{
    public const string SectionName = "Members";

    /// <summary>How long the members list waits for the presence singleton before it shows everyone offline.</summary>
    public int PresenceTimeoutMs { get; set; } = 2000;

    public TimeSpan PresenceTimeout => TimeSpan.FromMilliseconds(PresenceTimeoutMs);

    public void Validate()
    {
        if (PresenceTimeoutMs <= 0)
        {
            throw new InvalidOperationException("Members:PresenceTimeoutMs must be positive.");
        }
    }
}
