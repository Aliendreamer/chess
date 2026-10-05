## 1. The actor ends an abandoned engine game

- [x] 1.1 Failing TestKit tests in `Chess.Backend.Tests/Games/EngineGameTests.cs` (fail today because presence reports
      are dropped and nothing is persisted): the person (White) moves, reports `Absent`, 60 s pass → `GameEnded` `0-1`
      `Abandonment`; same with the person as Black after their first move → `1-0`; `Absent` then `Present` at 40 s →
      `PlayerLeft`, `PlayerReturned`, no end; `ClaimAbandonment` by either id → 409; no `AbandonmentOffered` ever;
      the person to move before their first move and absent → only the first-move abort (`Aborted`, no result).
- [x] 1.2 Failing test: a recovered engine game (person has moved) with no presence report at all ends after one lease
      plus `AbandonAfter` (presence does not wait for `_tracking`).
- [x] 1.3 Guard tests in `GamePresenceTests.cs` / `CorrespondenceGameTests.cs` stay green: people still get
      `AbandonmentOffered` + claim; correspondence still ignores presence.
- [x] 1.4 Implement in `Akka/Games/GameActor.cs`: accept reports in engine games for the person only;
      `PresenceActive` for engine games = playing and the person has moved (no `_tracking`); the engine's id always
      present; at `AbandonAfter` an engine game persists `Ended(engine side wins, Abandonment)` instead of
      `AbandonmentOffered`; `ClaimableBy` null in engine games. Update the doc comments citing engine-play D5.
      Commit: `feat(backend): leaving a game against the computer loses it`. Also: the engine's stall timer
      is due from the start of its turn, so presence re-arming never pushes it back (test
      `The_persons_presence_reports_never_push_the_engines_stall_back`).

## 2. The sweep wakes quiet engine games

- [x] 2.1 Failing tests in `Chess.Backend.Tests/Correspondence/DeadlineTests.cs` for `DueDeadlines` (fails today: no
      untimed rows returned): an untimed `playing` row quiet longer than `Akka:UntimedIdleMinutes` is returned; a
      recent one, an ended one and a quiet timed one are not; correspondence rows come first and the total stays
      ≤ `MaxPerSweep`.
- [x] 2.2 Failing actor test: `CheckDeadline` to an untimed engine game with the person absent is a wake-up that leads to
      the abandonment end; with the person present it changes nothing.
- [x] 2.3 Implement: `DueDeadlines` reads `rm_games` on `ProjectDbContext` (TimeControl `untimed`, Status `playing`,
      `UpdatedAt <= now - UntimedIdle`, oldest first) after the deadline rows; pass `AkkaOptions` timing in. Update the
      `DeadlineSweeper` summary. Commit: `feat(backend): the deadline sweep wakes quiet games against the computer`.
- [ ] 2.4 🐳 `pnpm exec nx integration-test backend` (human-run in the sandbox): an engine game with a move, its actor
      stopped, `rm_games.UpdatedAt` aged → the sweep ends it by abandonment and `rm_games` shows `ended`. Check the
      query plan; add an index only if it scans.

## 3. Verify on the stack

- [ ] 3.1 🐳 `tools/localdev/verify-part2.sh --quick` still passes (engine games play, restart mid-think).
- [ ] 3.2 🐳 By hand: start a game against the computer, move, close the tab → after a minute the game page shows
      "0-1 · Abandonment" and home's in-play count drops; the games stuck before the deploy are gone from `/watch`
      after a few minutes.

## 4. Docs

- [ ] 4.1 CLAUDE.md (engine-play note: presence and abandonment in engine games, the sweep), ROADMAP Part 5 (the
      live-home open note settled) and Part 2, Serena memory. Commit: `docs(repo): engine-game-abandonment`.
