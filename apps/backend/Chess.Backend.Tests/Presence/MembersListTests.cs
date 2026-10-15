using System.Text.Json;
using Chess.Backend.Akka.Presence;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.WebApi.Challenges;

namespace Chess.Backend.Tests.Presence;

/// <summary>The members list, the <c>user:</c> topic ids, the directory's reads and the challenge refusals (club-members).</summary>
public sealed class MembersListTests
{
    private static readonly DateTimeOffset Now = Time.Utc("2026-10-13T10:00:00Z");

    private static readonly IReadOnlyList<MemberRow> Rows =
    [
        new(1, "zed", Now.AddDays(-1)),
        new(2, "Bob", null),
        new(3, "amy", Now.AddHours(-1)),
        new(4, "carl", null),
    ];

    [Fact]
    public void Online_and_playing_come_first_then_everyone_by_name()
    {
        PresenceSnapshot presence = new(
            new Dictionary<long, MemberState> { [1] = MemberState.Playing, [4] = MemberState.Online },
            new Dictionary<long, DateTimeOffset>(),
            42);

        MembersView view = MembersList.Build(Rows, presence);

        Assert.Equal(["carl", "zed", "amy", "Bob"], view.Items.Select(i => i.Username));
        Assert.Equal([MemberState.Online, MemberState.Playing, MemberState.Offline, MemberState.Offline], view.Items.Select(i => i.State));
        Assert.Equal((true, 42L), (view.PresenceKnown, view.Seq));
    }

    [Fact]
    public void Without_presence_everyone_is_offline_and_the_list_still_loads()
    {
        MembersView view = MembersList.Build(Rows, null);

        Assert.False(view.PresenceKnown);
        Assert.All(view.Items, i => Assert.Equal(MemberState.Offline, i.State));
        Assert.Equal(["amy", "Bob", "carl", "zed"], view.Items.Select(i => i.Username));
    }

    [Fact]
    public void A_member_who_just_left_shows_the_singletons_time_until_the_directory_has_a_later_one()
    {
        PresenceSnapshot presence = new(
            new Dictionary<long, MemberState>(),
            new Dictionary<long, DateTimeOffset> { [1] = Now, [3] = Now.AddDays(-5) },
            1);

        MembersView view = MembersList.Build(Rows, presence);

        Assert.Equal(Now, view.Items.Single(i => i.Id == 1).LastSeenAt);
        Assert.Equal(Now.AddHours(-1), view.Items.Single(i => i.Id == 3).LastSeenAt); // the stored time is newer
    }

    [Fact]
    public void The_members_payload_is_camel_cased_with_lower_case_states()
    {
        string json = JsonSerializer.Serialize(MembersList.Build([new(2, "bob", null)], null), JsonSerializerOptions.Web);

        Assert.Equal("""{"items":[{"id":2,"username":"bob","state":"offline","lastSeenAt":null}],"presenceKnown":false,"seq":0}""", json);
    }

    [Theory]
    [InlineData("1", true)]
    [InlineData("42", true)]
    [InlineData("0", false)]
    [InlineData("-1", false)]
    [InlineData("+4", false)]
    [InlineData("007", false)]
    [InlineData("4a", false)]
    [InlineData("", false)]
    public void A_user_topic_names_a_positive_member_id_in_plain_digits(string id, bool valid) =>
        Assert.Equal(valid, UserLiveSource.TryParseId(id, out _));

    [Fact]
    public void The_user_topic_is_spelled_from_the_id() => Assert.Equal("user:42", UserLiveSource.Topic(42));

    [Fact]
    public async Task The_directory_lists_active_members_only_never_the_engine()
    {
        using ProjectDbContext db = TestDb.Create();
        db.Users.AddRange(
            new User { Id = -1, Sub = "engine-1320", Username = "Stockfish" },
            new User { Id = 1, Sub = "a", Username = "ann", LastSeenAt = Now },
            new User { Id = 2, Sub = "b", Username = "bob", Active = false },
            new User { Id = 3, Sub = "c" });
        await db.SaveChangesAsync();

        IReadOnlyList<MemberRow> rows = await MemberDirectory.ActiveMembersAsync(db, CancellationToken.None);

        Assert.Equal([new MemberRow(1, "ann", Now), new MemberRow(3, "#3", null)], rows.OrderBy(r => r.Id));
    }

    [Fact]
    public async Task Live_games_are_the_timed_ones_still_being_played()
    {
        using ProjectDbContext db = TestDb.Create();
        RmGame Row(string tc, string status) => new()
        {
            GameId = Guid.CreateVersion7(),
            WhiteId = 1,
            BlackId = 2,
            WhiteName = "w",
            BlackName = "b",
            TimeControl = tc,
            Status = status,
            LastFen = "fen",
        };
        RmGame live = Row("5+3", RmGame.Playing);
        db.RmGames.AddRange(live, Row("5+3", RmGame.Ended), Row("untimed", RmGame.Playing));
        await db.SaveChangesAsync();

        IReadOnlyList<LiveGame> games = await MemberDirectory.LiveGamesAsync(db, CancellationToken.None);

        Assert.Equal([new LiveGame(live.GameId, 1, 2)], games);
    }

    [Theory]
    [InlineData("Self", "You cannot challenge yourself.")]
    [InlineData("Offline", "bob is offline.")]
    [InlineData("Playing", "bob is playing.")]
    [InlineData("AlreadyChallenged", "bob already has a challenge.")]
    [InlineData("ChallengeOut", "You already have a challenge out.")]
    public void Every_refusal_reads_as_a_sentence(string reason, string text) =>
        Assert.Equal(text, ChallengeHttp.Refusal(Enum.Parse<ChallengeRefusal>(reason), "bob"));

    [Fact]
    public void The_members_timeout_must_be_positive()
    {
        new MembersOptions().Validate();
        Assert.Throws<InvalidOperationException>(() => new MembersOptions { PresenceTimeoutMs = 0 }.Validate());
    }
}
