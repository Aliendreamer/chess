using Chess.Backend.Authentication;
using Chess.Backend.Correspondence;
using Chess.Backend.Events;

namespace Chess.Backend.Tests.Correspondence;

public sealed class NotificationMailsTests
{
    [Fact]
    public void Your_move_names_the_opponent_their_move_the_deadline_and_the_link()
    {
        Mail mail = NotificationMails.YourMove("b@x", "testuser", "e4", "http://app/games/1", Time.Utc("2026-10-04T10:00:00Z"));

        Assert.Equal(("b@x", "Your move against testuser"), (mail.To, mail.Subject));
        Assert.Equal("testuser played e4. It is your move.\n\nPlay it before 2026-10-04 10:00 UTC: http://app/games/1\n", mail.Body);
    }

    [Fact]
    public void The_first_move_says_the_game_started()
    {
        Mail mail = NotificationMails.YourMove("w@x", "player", null, "http://app/games/1", Time.Utc("2026-10-04T10:00:00Z"));

        Assert.StartsWith("Your game against player has started and it is your move.", mail.Body, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("1-0", true, "You won")]
    [InlineData("1-0", false, "You lost")]
    [InlineData("0-1", true, "You lost")]
    [InlineData("1/2-1/2", false, "Draw")]
    [InlineData("*", true, "No result")]
    public void The_outcome_is_from_the_readers_side(string result, bool white, string outcome) =>
        Assert.Equal(outcome, NotificationMails.Outcome(result, white));
}

public sealed class NotificationConsumerTests
{
    private static readonly DateTimeOffset T0 = Time.Utc("2026-09-27T10:00:00Z");
    private static readonly Guid Game = Guid.Parse("0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f");
    private const string AfterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

    private sealed class RecordingMailer : IMailer
    {
        public List<Mail> Sent { get; } = [];

        public Task SendAsync(Mail mail, CancellationToken ct)
        {
            Sent.Add(mail);
            return Task.CompletedTask;
        }
    }

    private static string Env<T>(string type, long seq, T payload) =>
        EventJson.Serialize(new EventEnvelope<T>(type, 1, Game.ToString("N"), seq, T0.AddHours(seq), payload));

    private static string Created(string tc = "7d") => Env("game.created", 1, new GameCreated(1, 2, tc, 0, 0, T0));

    private static (ProjectDbContext Db, NotificationConsumer Consumer, RecordingMailer Mailer) Build()
    {
        ProjectDbContext db = TestDb.Create();
        db.Users.AddRange(
            new User { Id = 1, Sub = "s1", Username = "ann", Email = "ann@chess.localhost" },
            new User { Id = 2, Sub = "s2", Username = "bob", Email = "bob@chess.localhost" });
        db.SaveChanges();
        RecordingMailer mailer = new();
        NotificationConsumer consumer = new(
            db,
            mailer,
            Options.Create(new CorrespondenceOptions()),
            Options.Create(new KeycloakOptions { AppBaseUrl = "http://app.chess.localhost/" }),
            NullLogger<NotificationConsumer>.Instance);
        return (db, consumer, mailer);
    }

    private static async Task ApplyAll(NotificationConsumer c, params string[] events)
    {
        foreach (string e in events)
        {
            await c.ApplyAsync(Game.ToString("N"), e, CancellationToken.None);
        }
    }

    [Fact]
    public async Task A_live_game_mails_nothing()
    {
        (ProjectDbContext db, NotificationConsumer c, RecordingMailer mailer) = Build();
        using (db)
        {
            await ApplyAll(c, Created("5+3"), Env("game.move-made", 2, new MoveMade(1, "e2e4", "e4", AfterE4, 0, 0, T0)));

            Assert.Empty(mailer.Sent);
        }
    }

    [Fact]
    public async Task White_hears_the_game_started_then_black_hears_each_move_once()
    {
        (ProjectDbContext db, NotificationConsumer c, RecordingMailer mailer) = Build();
        using (db)
        {
            string[] events = [Created(), Env("game.move-made", 2, new MoveMade(1, "e2e4", "e4", AfterE4, 0, 0, T0))];
            await ApplyAll(c, events);
            await ApplyAll(c, events); // a replay mails nothing

            Assert.Equal(
                [("ann@chess.localhost", "Your move against bob"), ("bob@chess.localhost", "Your move against ann")],
                mailer.Sent.Select(m => (m.To, m.Subject)));
            Assert.Contains("http://app.chess.localhost/games/0199f1c2a3b47c5d8e9f0a1b2c3d4e5f", mailer.Sent[1].Body, StringComparison.Ordinal);
            Assert.Contains("before 2026-10-04 12:00 UTC", mailer.Sent[1].Body, StringComparison.Ordinal); // the move's time + 7 days
        }
    }

    [Fact]
    public async Task Both_players_hear_the_result()
    {
        (ProjectDbContext db, NotificationConsumer c, RecordingMailer mailer) = Build();
        using (db)
        {
            await ApplyAll(c, Created(), Env("game.ended", 2, new GameEnded("0-1", "Timeout", 0, 0, T0)));

            Assert.Equal(
                ["Your move against bob", "Your game against bob: You lost", "Your game against ann: You won"],
                mailer.Sent.Select(m => m.Subject));
        }
    }

    [Fact]
    public async Task A_player_without_an_email_is_skipped()
    {
        (ProjectDbContext db, NotificationConsumer c, RecordingMailer mailer) = Build();
        using (db)
        {
            (await db.Users.SingleAsync(u => u.Id == 1)).Email = null;
            await db.SaveChangesAsync();

            await ApplyAll(c, Created());

            Assert.Empty(mailer.Sent);
            Assert.Equal(1, await db.NotificationGames.CountAsync()); // still followed, for Black's turns
        }
    }
}
