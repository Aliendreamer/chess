using System.Globalization;
using System.Text.Json;
using Chess.Backend.Authentication;
using Chess.Backend.Events;
using Chess.Backend.Extensions;
using Chess.Backend.Games;
using Chess.Backend.Projections;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace Chess.Backend.Correspondence;

/// <summary>Section <c>Smtp</c> (correspondence-games D4). No host means no mail: notifications are only logged.</summary>
internal sealed class SmtpOptions : ISettings
{
    public const string SectionName = "Smtp";

    public string Host { get; set; } = string.Empty;

    public int Port { get; set; } = 587;

    public string User { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;

    public string From { get; set; } = "chess@chess.localhost";

    /// <summary>STARTTLS when the server offers it; off for a local catcher such as Mailpit.</summary>
    public bool UseTls { get; set; }

    public bool Enabled => !string.IsNullOrWhiteSpace(Host);

    public void Validate()
    {
        if (Enabled && (Port is <= 0 or > 65535 || string.IsNullOrWhiteSpace(From)))
        {
            throw new InvalidOperationException("Smtp:Port must be 1-65535 and Smtp:From set when Smtp:Host is.");
        }
    }
}

/// <summary>One plain-text email.</summary>
internal sealed record Mail(string To, string Subject, string Body);

internal interface IMailer
{
    Task SendAsync(Mail mail, CancellationToken ct);
}

/// <summary>Sends through SMTP with MailKit: Mailpit in the local stack, any provider in production.</summary>
[ExcludeFromCodeCoverage(Justification = "Talks to an SMTP server; exercised against Mailpit by verify-part3.sh.")]
internal sealed class SmtpMailer(SmtpOptions options) : IMailer
{
    public async Task SendAsync(Mail mail, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(mail);
        using MimeMessage message = new();
        message.From.Add(MailboxAddress.Parse(options.From));
        message.To.Add(MailboxAddress.Parse(mail.To));
        message.Subject = mail.Subject;
        message.Body = new TextPart("plain") { Text = mail.Body };

        using SmtpClient client = new();
        await client.ConnectAsync(options.Host, options.Port, options.UseTls ? SecureSocketOptions.StartTlsWhenAvailable : SecureSocketOptions.None, ct);
        if (!string.IsNullOrEmpty(options.User))
        {
            await client.AuthenticateAsync(options.User, options.Password, ct);
        }

        await client.SendAsync(message, ct);
        await client.DisconnectAsync(quit: true, ct);
    }
}

/// <summary>Without SMTP (unit tests, a bare run): the mail is logged, not sent.</summary>
internal sealed class LogMailer(ILogger<LogMailer> logger) : IMailer
{
    public Task SendAsync(Mail mail, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(mail);
        Utils.Log.MailNotSent(logger, mail.To, mail.Subject);
        return Task.CompletedTask;
    }
}

/// <summary>The texts of the notification mails, in one place.</summary>
internal static class NotificationMails
{
    public static Mail YourMove(string to, string opponent, string? lastSan, string gameUrl, DateTimeOffset deadline) => new(
        to,
        $"Your move against {opponent}",
        (lastSan is null ? $"Your game against {opponent} has started and it is your move." : $"{opponent} played {lastSan}. It is your move.")
        + $"\n\nPlay it before {deadline.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)} UTC: {gameUrl}\n");

    public static Mail Ended(string to, string opponent, string outcome, string reason, string gameUrl) => new(
        to,
        $"Your game against {opponent}: {outcome}",
        $"Your correspondence game against {opponent} is over: {outcome} ({reason}).\n\n{gameUrl}\n");

    /// <summary>"You won", "You lost" or "Draw" from the result and the reader's colour.</summary>
    public static string Outcome(string result, bool readerIsWhite) => result switch
    {
        "1-0" => readerIsWhite ? "You won" : "You lost",
        "0-1" => readerIsWhite ? "You lost" : "You won",
        "1/2-1/2" => "Draw",
        _ => "No result",
    };
}

/// <summary>
/// Mails the players of correspondence games from <c>game.events</c> (correspondence-games D4): the player to move after
/// the start and after every move, and both players at the end. Addresses are read from <c>users</c> when mailing, so a
/// changed email is used. The mail goes before the watermark is saved: a replay mails nothing, and only a crash in
/// between could mail twice.
/// </summary>
internal sealed class NotificationConsumer(
    ProjectDbContext db,
    IMailer mailer,
    IOptions<CorrespondenceOptions> correspondence,
    IOptions<KeycloakOptions> keycloak,
    ILogger<NotificationConsumer> logger) : IProjection
{
    public string Topic => "game.events";

    public string GroupId => "chess.notifications";

    public async Task ApplyAsync(string key, string json, CancellationToken ct)
    {
        if (!EventJson.TryDeserialize(json, out EventEnvelope<JsonElement>? e)
            || !e.Type.StartsWith("game.", StringComparison.Ordinal)
            || !Guid.TryParseExact(e.AggregateId, "N", out Guid gameId))
        {
            return;
        }

        NotificationGame? game = await db.NotificationGames.SingleOrDefaultAsync(g => g.GameId == gameId, ct);
        if (game is null)
        {
            if (e.Type == "game.created" && e.Payload.Deserialize<GameCreated>() is { } created
                && created.TimeControl == TimeControl.Correspondence7.ToString())
            {
                await StartAsync(gameId, e, created, ct);
            }

            return;
        }

        switch (IdempotencyGuard.Decide(game.LastSeq, e.Seq))
        {
            case SeqDecision.Skip:
                return;
            case SeqDecision.Gap:
                Utils.Log.ProjectionGap(logger, GroupId, e.AggregateId, game.LastSeq, e.Seq);
                throw new ProjectionGapException(GroupId, e.AggregateId, game.LastSeq, e.Seq);
        }

        if (e.Type == "game.move-made" && e.Payload.Deserialize<MoveMade>() is { } move)
        {
            bool whiteToMove = move.FenAfter.Split(' ') is [_, "w", ..];
            await YourMoveAsync(game, whiteToMove, move.San, e.At, ct);
        }
        else if (e.Type == "game.ended" && e.Payload.Deserialize<GameEnded>() is { } end)
        {
            await MailAsync(game.WhiteId, NotificationMails.Ended(string.Empty, game.BlackName, NotificationMails.Outcome(end.Result, true), end.Reason, Url(game.GameId)), ct);
            await MailAsync(game.BlackId, NotificationMails.Ended(string.Empty, game.WhiteName, NotificationMails.Outcome(end.Result, false), end.Reason, Url(game.GameId)), ct);
        }

        game.LastSeq = e.Seq;
        await db.SaveChangesAsync(ct);
    }

    private async Task StartAsync(Guid gameId, EventEnvelope<JsonElement> e, GameCreated created, CancellationToken ct)
    {
        Dictionary<long, string?> names = await db.Users.AsNoTracking()
            .Where(u => u.Id == created.WhiteId || u.Id == created.BlackId)
            .ToDictionaryAsync(u => u.Id, u => u.Username, ct);
        NotificationGame game = new()
        {
            GameId = gameId,
            WhiteId = created.WhiteId,
            BlackId = created.BlackId,
            WhiteName = NameOf(names, created.WhiteId),
            BlackName = NameOf(names, created.BlackId),
            LastSeq = e.Seq,
        };
        await YourMoveAsync(game, whiteToMove: true, lastSan: null, e.At, ct);
        db.NotificationGames.Add(game);
        await db.SaveChangesAsync(ct);
    }

    private Task YourMoveAsync(NotificationGame game, bool whiteToMove, string? lastSan, DateTimeOffset at, CancellationToken ct) =>
        MailAsync(
            whiteToMove ? game.WhiteId : game.BlackId,
            NotificationMails.YourMove(string.Empty, whiteToMove ? game.BlackName : game.WhiteName, lastSan, Url(game.GameId), at + correspondence.Value.MoveDeadline),
            ct);

    /// <summary>Addresses <paramref name="mail"/> to <paramref name="userId"/>'s current email; a user without one is skipped.</summary>
    private async Task MailAsync(long userId, Mail mail, CancellationToken ct)
    {
        string? email = await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.Email).SingleOrDefaultAsync(ct);
        if (string.IsNullOrWhiteSpace(email))
        {
            Utils.Log.MailSkipped(logger, userId, mail.Subject);
            return;
        }

        await mailer.SendAsync(mail with { To = email }, ct);
    }

    private string Url(Guid gameId) => $"{keycloak.Value.AppBaseUrl.TrimEnd('/')}/games/{gameId:N}";

    private static string NameOf(Dictionary<long, string?> names, long userId) =>
        names.TryGetValue(userId, out string? name) && !string.IsNullOrEmpty(name)
            ? name
            : string.Create(CultureInfo.InvariantCulture, $"Player {userId}");
}
