# Part 1 — experiment note (live games vs people)

Closed on 2026-09-27. Changes: `game-core`, `game-read-side`, `matchmaking-and-invites`, `part1-ui`,
`presence-and-abandonment`, then `backend-layout`, `startup-logging-and-config`, `frontend-layout` and
`part1-close-out` (all under `changes/archive/`).

**What exists:** games with server clocks, matchmaking by time control, invite links, the read side on the replica with
PGN, presence and abandonment claims, and the Club UI. Proof that it works:

- Backend: 543 unit tests and 26 Testcontainers integration tests.
- Frontend: 201 unit tests and 17 Playwright specs (checkmate, resignation, agreed draw, abandonment, and the live
  relay).
- `verify-part1.sh --cluster`: games survive losing a node on the live two-node stack.

## What worked

- **One actor per game, event-sourced, with the journal as the outbox.** The game never writes to Kafka itself;
  projections and the live relay fall out of the same events. Recovery after a node loss restored clocks exactly as
  D14 says, on the live cluster too.
- **The server is the only referee.** chess.js only gives feedback in the browser; the answer or the next frame always
  wins. No desync bugs came from the client.
- **Seq everywhere.** Frames are applied only if newer, projections dedupe by `(aggregate, seq)` and stall on a gap, and
  commands answer with a seq. Races between a command's answer, its frame and a reconnect snapshot resolved themselves.
- **Verify scripts on the real stack.** They found problems the unit and integration tests could not: stale queue
  pairings, the ghost game, and a failover check that proved nothing (below).
- **Spec first (OpenSpec).** Writing the target down before moving code saved rework whenever it was used; the layout
  work went wrong exactly when it was skipped.

## What surprised us

- **Library defaults.** Gera.Chess shares our root namespace `Chess` (it is used through an alias in one file) and has
  its automatic draw rules off by default. Akka's default idle passivation (120 s) would have killed running clocks.
  FastEndpoints answers 415 to a body-less POST that has a request DTO unless it calls `ClearDefaultAccepts()`. The
  .NET options binder appends configured arrays to a non-empty default, which ran the node with its role twice.
- **Every persisted event must reach Kafka.** Presence events were journal-only at first, which left seq gaps, and every
  game consumer stalled on them.
- **Queues remember.** A fresh join could be answered with the player's previous, finished pairing. Fixed by returning
  the queue seq with the join, so older pairings are ignored.
- **Unknown ids are not harmless.** Waking a `GameActor` for an id that was never created armed its abort timer, which
  journalled an "Aborted" ending for a game that never existed; the read side parked it. Found through the dead-letter
  health check and fixed in `5524ef3`.
- **A failover test can pass without failing anything over.** A node shutting down gracefully still answers
  requests, the edge keeps a dead node in round-robin until its 5 s health check marks it down, and most games do not
  even live on the node that stops. `verify-part1.sh --cluster` now waits for the process to exit, runs six games,
  and uses the D14 clock reset to tell which games really were recovered.
- **Keycloak's quick-login check** locks a user who signs in twice within a second, so the e2e suite signs each user
  in once and reuses the saved session.
- **The replica lags by design.** A brand-new game may not be on the replica yet, so the game page retries the
  summary, and fills in the move list from the frame's SAN when the replica is one move behind (D4).

## For Part 2 (play vs the computer)

- **Keep:** the same `GameActor`, with the engine as a player (ROADMAP: "an engine subscription, not a special game
  type"); requests and results over Kafka (`analysis.requests` / `analysis.results` already exist); seq on everything
  the engine answers; a `verify-part2.sh` that plays on the live stack, including an engine restart mid-game.
- **Decide up front:**
  - where Stockfish runs (the Linux binary is in `apps/backend/chessengine`);
  - how strength maps to UCI options;
  - what an engine that does not answer in time means for the clock;
  - how the engine process is stopped (the SIGTERM lesson above applies to child processes too).
- **Start with the layout rules** (`backend-layout`, `frontend-layout`) instead of tidying afterwards, and write the
  spec before the code.
