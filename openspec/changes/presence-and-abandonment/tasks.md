Each group ends in one commit that passes `pnpm exec nx run-many -t lint test build` for the projects it
touches. 🐳 marks steps that need Docker or the live stack. Expected values in tests are fixed literals.

## 1. Presence and abandonment in the game actor

- [x] 1.1 Failing TestKit tests (`GamePresenceTests`, fake clock, `TestScheduler`): a player's last instance
      `Absent` persists `PlayerLeft` (only at ply ≥ 2 while playing); a lease not refreshed for 75 s does the
      same; two instances need both gone; `claimableBy` appears 60 s after leaving and only if the other player
      is present; a return persists `PlayerReturned` and clears it; claim win/draw ends `1-0`/`1/2-1/2` with
      `Abandonment`; early, wrong player, or after return is `Conflict`; non-players are ignored; after a restart
      the absence restarts from recovery (D4) and the other player is presumed present for 75 s.
- [x] 1.2 Implement: `Present`/`Absent`/`ClaimAbandonment` commands, `PlayerLeft`/`PlayerReturned` events,
      `EndReason.Abandonment` (+ PGN `abandoned`), `GameView.AbsentId`/`ClaimableBy`, lease sweep and claim timers.
      Commit: `feat(backend): abandonment claims from player presence`.

## 2. Hub and endpoint

- [x] 2.1 `LiveHub.Present/Absent(topic, userId, instance)` (Relay role; `game` topics only, others ignored) →
      the games region; `POST /api/games/{id}/claim` with the reply mapper. Unit-test the mapping of the claim
      body; the hub stays thin.
- [x] 2.2 🐳 Integration test (`GamePresenceFlowTests`): a hub client reports both players present, White and
      Black move, Black is reported `Absent`; with the actor's timers shortened by options (`GameOptions:
AbandonAfter`, `PresenceLease`, test-only values), White's frame gets `claimableBy`, the claim ends the game
      with `Abandonment`, and the PGN says `abandoned`. Commit: `feat(backend): presence on the hub and the claim
endpoint`.

## 3. BFF presence reporting

- [ ] 3.1 Failing tests: `openRelay` hands the `/api/me` user id to `mux.subscribe`; the multiplexer sends
      `Present` on a user's first `game:` socket and `Absent` on the last, nothing for `ping:`/`queue:`/`invite:`,
      re-sends every held presence on the 30 s timer and on reconnect, all under one instance id.
- [ ] 3.2 Implement. Commit: `feat(frontend): report player presence to the hub`.

## 4. The page

- [ ] 4.1 Failing tests: `useLiveTopic` reconnects after 1/2/4/8/15 s with `status: 'reconnecting'`, not after
      4400/4401 or unmount; `GameView` guard accepts the new fields; the claim command posts
      `{"outcome":…}` to `…/claim`.
- [ ] 4.2 Game page: the claim panel (Claim win / Call it a draw / Keep waiting) for `claimableBy === me.id`, the
      reconnect banner, and the signed-out message. Commit: `feat(frontend): claim abandoned games and reconnect
the live feed`.

## 5. End to end and docs 🐳

- [ ] 5.1 🐳 Playwright: start a game from an invite, both move once, close Black's page; within ~2 min White is
      offered the claim, claims the win, and sees `1–0` · abandonment. Proof: `pnpm exec playwright test`.
- [ ] 5.2 ROADMAP D15 (the lease and instance key), `openspec/architecture.md` (presence in the game's life) and
      CLAUDE.md. Commit: `docs(repo): presence and abandonment in architecture`.
