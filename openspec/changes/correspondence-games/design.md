## Context

Part 2 left untimed games that passivate when idle and recover unchanged; correspondence builds on that. Games are
event-sourced sharded actors; every persisted game event goes to `game.events`; projections keep their watermark on
their own row. Users have Keycloak emails in `users.Email`. There is no SMTP anywhere yet.

## Goals / Non-Goals

**Goals:** 7-day per-move deadlines enforced without the actor in memory; emails for "your move" and the end; a
"your turn" list; all verified on the live stack with Mailpit.

**Non-Goals:** other correspondence lengths, vacation time, deadline-soon reminders, email preferences or
unsubscribe, correspondence matchmaking or engine opponents, a production SMTP provider.

## Decisions

### D1 — `TimeControl.Correspondence7`

A value in a new category `Correspondence`, written `7d`. Its per-move time comes from one setting,
`Correspondence:MoveDeadline` (a TimeSpan, default `7.00:00:00`), so integration tests can shorten it to seconds.
`TryParse` keeps its presets; invites accept a preset or `7d` (`TimeControl.TryParseInvite`); the queue does not.

### D2 — The actor

`ClocksRunning` is false for correspondence (like untimed). The deadline is derived, never stored in the actor:
`(Ply == 0 ? createdAt : lastMoveAt) + MoveDeadline`. `Rearm` arms no clock or abort timer for correspondence, only
idle passivation (`Akka:UntimedIdleMinutes`, renamed in docs as "idle minutes for games without a clock"). A new
command `CheckDeadline(gameId)` ends the game if `now >= deadline` (abort before both first moves, else `Timeout`
for the side to move, with the insufficient-material rule of D18 as for flag fall), otherwise does nothing. Presence
reports are ignored (like engine games).

### D3 — Deadlines from the database

`DeadlineProjection` on `game.events` (group `chess.deadlines`) keeps `game_deadlines(GameId, DueAt, LastSeq)` for
correspondence games only: `game.created` → due = at + 7 d; `game.move-made` → due = at + 7 d; `game.ended` → row
deleted-with-tombstone (kept with `DueAt = null`, so replays are skipped by the watermark, the engine-play lesson).
`DeadlineSweeper` is a cluster singleton that every `Correspondence:SweepSeconds` (60) reads rows with
`DueAt <= now` from the primary and sends `CheckDeadline` to the games region for each (at most 100 per sweep). The
actor is the judge: a row that is momentarily stale (the projection is behind) only causes a harmless check.

### D4 — Notifications

`NotificationConsumer` on `game.events` (group `chess.notifications`) with its own watermark row per game
(`notification_positions`), handling every game event and acting on correspondence ones:

- `game.created` (correspondence) → remembers the game in its row (players, names) so later events are self-sufficient;
- `game.move-made` → email to the player to move: subject "Your move against {opponent}", body with the move and
  `{AppBaseUrl}/games/{id}`;
- `game.ended` → email to both with the result and reason.
  The email is sent before the watermark is saved. A replayed event is skipped by the watermark, so it never sends again;
  only a crash between sending and saving can send one duplicate. That window is accepted (see Risks).
  `IMailer` with `SmtpMailer` (MailKit; `Smtp:Host`, `Port`, `User`, `Password`, `From`, `UseTls`) and `LogMailer` when
  `Smtp:Host` is empty. Addresses come from `users.Email`; a user without one is skipped and logged.

### D5 — Read model and API

`rm_games` gains `SideToMove` (from the FEN, `white|black`) and `DeadlineAt` (correspondence, null otherwise), filled
by `GameProjection`. `GET /api/me/games?turn=mine` filters `Status = playing` and the user's colour = `SideToMove`,
ordered by `DeadlineAt` nulls last then newest; items gain `deadlineAt` and `yourTurn`.

### D6 — Stack and UI

Compose adds `mailpit` (`axllent/mailpit`, SMTP 1025, UI via Traefik `mail.chess.localhost`, file-provider route) and
`Smtp__Host=mailpit`, `Smtp__Port=1025`, `Smtp__From=chess@chess.localhost` on the backends. The invite form gets a
`7 days` chip; home gets "Your turn" above "Recent games"; the game page shows "Your move · 6 days left" /
"Waiting for X · 6 days left" instead of clocks.

## Risks / Trade-offs

- A sweep minute of lateness on a 7-day deadline is irrelevant; the actor's own `now` decides.
- The rare crash between sending and saving may send one duplicate email; exactly-once email would need an outbox of
  its own, not worth it now.
- Free SMTP providers limit volume and need SPF/DKIM for delivery; that is the later provider decision.
