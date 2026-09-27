## Why

Part 3 of the ROADMAP: correspondence games. Two people play at their own pace, a move every few days. The game only
lives in memory while someone acts on it, a missed deadline loses, and the player to move gets an email.

## What Changes

- **A correspondence time control, written `7d`: 7 days per move.**
  - The deadline resets after every move; it is not a running clock that adds up.
  - Before both first moves, a missed deadline aborts the game, as with live games. After that, the player who missed
    it loses (reason `Timeout`).
  - It is offered in invites only. A queue would need both players online together, which is not what correspondence
    is for.
- **The game actor keeps no timers while waiting.** A correspondence game passivates when idle, as untimed games
  already do, and recovers unchanged.
- **Deadlines are enforced from the database.**
  1. A projection keeps `game_deadlines` (game, side to move, due at) up to date from `game.events`.
  2. A cluster singleton, `DeadlineSweeper`, checks for due rows every minute and sends the game a `CheckDeadline`.
  3. The game decides from its own state, and ends it if the deadline really has passed.

  Deadlines therefore survive restarts, passivation and failover. At-least-once delivery is safe, because checking a
  deadline twice ends the game at most once.

- **Presence-based abandonment is off in correspondence games.** Being away for a minute means nothing when a move may
  take days. The missed deadline is the correspondence form of abandonment.
- **Email notifications.** A `NotificationConsumer` on `game.events` emails:
  - the player to move after each correspondence move ("Your move against X");
  - both players when a correspondence game ends.

  It sends through SMTP (MailKit), configured by an `Smtp` section. It never sends twice for the same event, and
  without SMTP configured it only logs.

- **Local mail:** a Mailpit container catches every mail (SMTP on `mailpit:1025`, web UI at `mail.chess.localhost`).
  Production uses any SMTP provider through configuration; which free provider is decided later.
- **"Your turn" on home:** the games, live or correspondence, where it is your move, with the deadline for
  correspondence games. The data comes from `GET /api/me/games?turn=mine`. The game page shows "Your move · 6 days
  left" instead of clocks in a correspondence game.
- **The read model** needs no new columns: the side to move and the deadline are derived from `rm_games`.

## Owner decisions (design conversation, 2026-09-27) — confirmed, with Mailpit explained

1. **7 days per move, reset after every move** (my reading of "1 week is fine").
2. **Presence-based abandonment off in correspondence games; the missed deadline is its correspondence form** (my
   reading of "3 yes").
3. **SMTP:** Mailpit locally now; a free production SMTP provider chosen later, by configuration only.
4. **A "your turn" list on home:** yes.
5. **Correspondence games start from invites only** (my recommendation, see above).

## Capabilities

### New Capabilities

- `correspondence-games`:
  - per-move deadlines and how they are enforced;
  - passivation while waiting;
  - email notifications;
  - the "your turn" list.

### Modified Capabilities

- `game-history`: the "my games" list can be filtered to the games where it is your turn.

## Impact

- **Backend:**
  - `Games/TimeControl.cs` (correspondence);
  - `GameActor` (no presence claims, `CheckDeadline`, passivation);
  - a deadline projection with a migration, and the `DeadlineSweeper` singleton;
  - `NotificationConsumer` with MailKit, and `Smtp` and `Correspondence` settings;
  - the `/api/me/games` turn filter.
- **Frontend:** the invite form's `7d` choice, the "Your turn" list, and the correspondence status line on the game page.
- **Stack:** a `mailpit` service, and SMTP settings on the backend.
- **Verify:**
  - Unit and integration tests, with short deadlines through settings.
  - `verify-part3.sh`: an invite at `7d`, moves, the "your move" mail in Mailpit, and the game passivated and woken.
    The forfeit itself is proved by the integration test, which shortens the deadline.
- **Docs:** CLAUDE.md, `architecture.md` and ROADMAP.
