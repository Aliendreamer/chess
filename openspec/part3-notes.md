# Part 3 — experiment note (correspondence games)

Closed on 2026-09-27. One change: `correspondence-games` (under `changes/archive/`). A `7d` game gives the player to
move a week, reset after every move; a missed deadline loses, the players are mailed, and "Your turn" on home lists
the games waiting for you.

**Checks behind it:**

- Backend: 626 unit tests and 31 integration tests. Two of them are correspondence games on real Redpanda and a
  Mailpit container, with the deadline shortened to seconds.
- Frontend: 212 unit tests and 19 Playwright specs, one of them a correspondence game through the UI.
- `verify-part3.sh` on the stack.

## What worked

- **The game stays the judge.** Deadlines are rows projected from `game.events`, and a sweeper only asks each overdue
  game to check itself. Restarts, passivation, failover and repeated checks needed no special handling; a move that
  arrives after the deadline ends the game the same way.
- **Nothing had to be stored twice.** The actor derives its deadline from the last move. The read model derives the
  side to move (the ply's parity) and the deadline (last move plus a week), so there were no new columns.
- **Real mail in the tests.** A Mailpit container in the integration fixture gets the same SMTP traffic as the stack.
  The test counts each player's mails exactly, so a duplicate or a missing mail fails it.
- **Part 2's groundwork carried over:** untimed games already passivated when idle and recovered unchanged.

## What surprised us

- **The cached MailKit was vulnerable.** The 4.12.0 in the local package cache had two known advisories (STARTTLS
  response injection; CRLF injection in MimeKit). NuGet's audit, treated as an error, stopped the build, and we moved
  to 4.18.1.
- **A test misread its own spec.** After only 1.e4 a silent Black _aborts_ the game (no first move for both sides);
  a loss on time needs a later deadline. The code was right.
- **"6 days left" for a fresh week.** Rounding days down made a new deadline look a day short. Days now round to the
  nearest; hours and minutes still round down.
- **A spec broken since Part 2.** "Play the computer" added a second colour picker to home, and the invite specs
  clicked an ambiguous "White". Only the engine spec had been run after Part 2. Lesson: run the whole e2e suite at the
  end of every part.
- **E2e flakiness from parallelism.** Six workers, each driving two browsers against one dev server, timed out a
  random spec. Two workers take the same 1.3 minutes (the abandonment spec sets the length) and passed twice in a row.
- **Replica lag in the UI.** The live frame says "Your move" before the replica's "Your turn" list has the move; the
  spec reloads until it catches up, as a user would.

## Open, for later

- A production SMTP provider (with SPF and DKIM for the domain).
- Email preferences and unsubscribe.
- Deadline reminders ("a day left").
- Vacation time.
- Other correspondence lengths.
- Engine levels a beginner can beat (from Part 2).
