## Why

Part 2 of the ROADMAP: play a game against the computer. Stockfish 19 plays the other side at a chosen strength, in a
separate container, so it never competes for CPU with the game actors and can scale on its own.

## What Changes

- **A new app, `apps/engine`** (`Chess.Engine`), a .NET worker service. It is not part of the Akka cluster:
  - It keeps a pool of Stockfish processes and consumes `engine.moves.requests` from Kafka.
  - For each request it sends `position fen …`, sets the strength, runs `go movetime <thinkMs>`, and publishes the best
    move to `engine.moves.results`.
  - The Stockfish 19 binary is baked into its image from the local archive (moved to `apps/engine/stockfish/`, still
    git-ignored). Downloading it at build time comes later.
  - It gets its own Nx project, Dockerfile and compose service `engine`.
- **New Kafka topics `engine.moves.requests` and `engine.moves.results`**, only for play. `analysis.*` stays for Part 4.
- **Engine players are users.** Five seeded rows, one per strength:
  - Stockfish 1320, 1600, 2000 and 2400, which use `UCI_LimitStrength` + `UCI_Elo`.
  - Stockfish (max), which plays at full strength.
  - Games, names, PGN and lists work unchanged.
- **Untimed games.** A new `TimeControl.Untimed` means no clocks, no flag and no clock display. An engine game is always
  untimed for now. The first-move abort still applies to the human.
- **In engine games, presence and abandonment are off and draw offers are not offered.** A human can resign or abort.
  An idle untimed game passivates, and wakes up with the game unchanged.
- **The engine moves through the normal command path.**
  1. A backend consumer on `game.events` sees each creation or move that leaves the engine to move, and sends a
     request with a random think time of 5–10 s.
  2. A second consumer on `engine.moves.results` turns each answer into an ordinary `MakeMove` for the engine's user.
  3. Stale or duplicate answers are refused by the game and ignored.
  4. The game actor itself never talks to Kafka and journals nothing new.
- **API:** `POST /api/engine-games { level, color }` starts a game against the chosen level. `GET /api/engine-levels`
  lists the levels.
- **UI:** a "Play the computer" section on the home page, with the level, your colour and a Start button. The game page
  hides clocks and draw controls in engine games and shows "Stockfish is thinking…" while the engine has the move.
- **ROADMAP §6 Part 2** is updated: the engine pool lives in the worker, not in an `EngineActor`, and moves use their
  own topics.

## Owner decisions taken in the design conversation (2026-09-27)

- **The engine runs in a separate container:** a small .NET worker in this repo.
- **Separate topics for play;** analysis is Part 4.
- **Think time is a random 5–10 s per move**, whatever the strength. Stockfish uses the whole time at every level
  (measured).
- **Engine games are untimed for now.**
- **Levels:** 1320, 1600, 2000, 2400 and max.

## Capabilities

### New Capabilities

- `engine-play`: games against Stockfish (levels, untimed play, how the engine's moves are requested and applied,
  and recovery when the worker restarts).

### Modified Capabilities

None changes its requirements. `game-play`'s rules apply to engine games unchanged; untimed is a new time control, and
the exemptions for engine games are specified in `engine-play`.

## Impact

- **New:** `apps/engine/**`, `tools/localdev/engine.dev.Dockerfile`, a compose service, the two topics in
  `redpanda-init`, `tools/localdev/verify-part2.sh`, and a Playwright spec.
- **Backend:**
  - `Games/TimeControl.cs` (Untimed), `GameActor` (untimed and engine games), and `GameCreated` (an optional `Engine`
    field; old journal rows still read).
  - A migration seeding the engine users.
  - Two Kafka consumers, `WebApi/EngineGames/`, and the `Engine` settings section.
- **Frontend:** the home page, the game page, `lib/games.ts` and `lib/server/api.ts`.
- **Docs:** CLAUDE.md, `openspec/architecture.md` and ROADMAP.
