## Context

Games are sharded `GameActor`s, one per game, and they are event-sourced. Every event a game persists must go to
`game.events`, because consumers stall on a seq gap. Players are `users.Id`. Actors never produce to Kafka; the journal
publisher does.

Stockfish is a separate OS process that speaks UCI over stdin/stdout. Stockfish 19 offers `Skill Level` 0–20, or
`UCI_LimitStrength` + `UCI_Elo` 1320–3190 (the Elo is converted to a skill level internally), and `go movetime <ms>`.
Measured on this binary: at the weakest setting it still searches the whole movetime, and simply chooses a worse move.

## Goals / Non-Goals

**Goals:**

- Play a full game against Stockfish at five levels.
- The engine runs in its own container and scales on its own.
- An engine restart mid-game loses nothing.
- No new events in the game journal beyond one optional field.

**Non-Goals:**

- Analysis or evaluation (Part 4).
- Engine games with clocks.
- Ratings.
- Levels weaker than 1320.
- Downloading Stockfish at build time.
- Engine vs engine.

## Decisions

### D1 — A worker container, not an actor pool

`apps/engine` is a .NET worker (Generic Host) with Confluent.Kafka.

- **The pool:** `Engine:Processes` Stockfish processes (default 1), each with `Threads=1` and a fixed `Hash`.
- **Per request:** a process is taken from the pool, then the worker sends:
  - `ucinewgame`;
  - the strength options;
  - `position fen <fen>`;
  - `go movetime <thinkMs>`.

  It then reads until `bestmove`.

- **Delivery:** the worker commits the Kafka offset only after the result has been produced (at-least-once).
- **A process that dies or does not answer** within `thinkMs + 10 s` is killed and replaced, and the request is retried
  once, then dropped. The game re-requests when it is next woken (D6).

Why not an actor pool in the backend: CPU contention with the game clocks, and scaling tied to backend nodes. Why not
Akka in the worker: it needs nothing but Kafka.

### D2 — Engine players are seeded users

A migration seeds five `users` rows:

| Sub           | Username         | Settings                                |
| ------------- | ---------------- | --------------------------------------- |
| `engine:1320` | `Stockfish 1320` | `UCI_LimitStrength` on, `UCI_Elo` 1320  |
| `engine:1600` | `Stockfish 1600` | `UCI_LimitStrength` on, `UCI_Elo` 1600  |
| `engine:2000` | `Stockfish 2000` | `UCI_LimitStrength` on, `UCI_Elo` 2000  |
| `engine:2400` | `Stockfish 2400` | `UCI_LimitStrength` on, `UCI_Elo` 2400  |
| `engine:max`  | `Stockfish`      | full strength (`UCI_LimitStrength` off) |

They have fixed ids, so they can be referenced from config and tests. The read side, PGN tags, the game lists and the
UI's names need no change. The `engine:` sub cannot collide with a Keycloak sub, which is a UUID.

### D3 — `GameCreated` gains an optional `Engine`

The new field is `Engine(Side, Level)?`. It is null for human games, so old journal rows (Newtonsoft) and Kafka payload
v1 still read. The actor keeps it, and `GameView` exposes `engineSide` and `engineLevel`. `CreateGame` carries it, and
`IGameStarter.StartAsync` gets an optional engine argument.

### D4 — `TimeControl.Untimed`

A new value whose `ToString()` is `untimed`, in category `Untimed`. It is not in `Presets`, so the queue and invites
cannot use it.

In `GameActor`, `ClocksRunning` is false for Untimed, so there is:

- no flag timer;
- no increment;
- no `TimedOut`.

The view's `whiteMs` and `blackMs` stay 0, so the API contract does not change; the UI hides clocks for `untimed`. The first-move abort stays: a human who never moves aborts after 1 min, as
today.

`PassivationPolicy` passivates an untimed game under way after `Akka:UntimedIdleMinutes` (default 30) without commands; the actor's presence timings become `GameTimings`, which carries it. Recovery
restores it exactly, because there is no clock to restore. The projection writes null clocks for untimed games.

### D5 — Engine games are exempt from presence and draws

For an engine game, `GameActor`:

- ignores presence (no `PlayerLeft`, `PlayerReturned` or `AbandonmentOffered` is ever persisted);
- refuses draw offers (409 "The computer does not take draw offers"), and the UI hides them.

Resign and abort work as usual.

### D6 — How a move is requested and applied (no new journal events)

**Requests.** `EngineRequestConsumer` is a backend `PositionedProjection` on `game.events`, group `chess.engine-requests`.

- On `game.created` with an engine side of White, and on every `game.move-made` whose FEN leaves the engine to move, it
  produces to `engine.moves.requests`:
  `{ gameId, ply, fen, level, thinkMs }`, keyed by game id, with `thinkMs` drawn uniformly from
  `Engine:MinThinkMs`–`Engine:MaxThinkMs` (5000–10000).
- It knows a game's engine side and level from a small `engine_games` table that it fills from `game.created`. That
  keeps every later event self-sufficient.
- On `game.ended` it marks the row ended, and keeps it: a replay of the game's events is then skipped by the watermark
  instead of asking the engine to move again.

**Results.** `EngineMoveConsumer` is on `engine.moves.results`, group `chess.engine-moves`.

- It sends `MakeMove(gameId, engineUserId, uci)` through the games region.
- The game checks turn and legality as for any player.
- A refusal (the game ended, a stale ply, or a duplicate) is logged at debug level and dropped. Because it is at-least-once
  everywhere, duplicates are expected and harmless.

**Lost requests.** The worker can drop a request after its retries, and a game can passivate or move to another node
while the engine is to move. So whenever the engine is to move (after a move, at creation, or when the game recovers),
`GameActor` arms an `EngineStall` timer: `Engine:StallSeconds` (60), or at once on recovery. If the engine has not
moved when it fires, the actor asks `IEngineNudger` (injected like `IGameStarter`) to produce a fresh request.

This is the one exception to "actors never produce to Kafka". It is justified because a request is not a domain fact:
nothing is journalled, and a duplicate request is harmless.

### D7 — API and UI

**API:**

- `POST /api/engine-games { level, color }` → the `GameView`.
- `GET /api/engine-levels` → the five levels with their names.
- Both follow the WebApi folder rules (request, validator, response, summary), with `SignedIn`.
- The color is white, black or random; random is drawn server-side.

**UI:**

- Home gets "Play the computer": level tiles (`OptionTile`), the colour choice, and Start. It navigates to the game.
- The game page:
  - With `engineSide`, it hides the clocks, the draw controls and the claim panel.
  - When the engine is to move, it shows "Stockfish is thinking…".
  - The engine's move arrives as a normal live frame.

### D8 — Topics, config, compose

- **Topics:** `redpanda-init` creates `engine.moves.requests` and `engine.moves.results`, with 3 partitions each.
- **Config:** the backend `Engine` section is `MinThinkMs`, `MaxThinkMs` and `StallSeconds`. The worker's `Engine`
  section is `Processes`, `StockfishPath`, `HashMb` and the Kafka bootstrap servers. All are `ISettings`, validated, and
  listed in `appsettings.json`.
- **Compose:** a service `engine` built from `tools/localdev/engine.dev.Dockerfile`, which extracts the archive at image
  build time. It has a CPU limit of 2.
- **Production image:** `apps/engine/Dockerfile`, and `tools/deploy/build.sh engine`.

## Risks / Trade-offs

- **The `EngineNudger` exception (D6)** weakens a rule. The alternative, a journalled request event, would need a second
  topic tag per event, or seq-gap handling in every game consumer. The exception is small, and no state depends on it.
- **1320 is still strong for beginners.** Weaker play needs our own handicaps (a later change).
- **The human abandoning an untimed game** leaves it "playing" until they resign. It passivates, so the cost is a row,
  not an actor. A cleanup comes with Part 3's deadlines.
- **The GPL binary in the image.** The local image never leaves the machine. Pushing an engine image needs the
  licence notice (the archive's `Copying.txt` is copied along).

## Verification

- **Unit tests:**
  - the UCI client, against a fake process;
  - the pool;
  - the request and result consumers;
  - untimed games and engine games in `GameActor`.
- **Integration:** a Testcontainers round trip with a fake engine responder.
- **`verify-part2.sh` on the live stack:**
  - a game at 1320, 2000 and max, 10 moves each, with the script's own side chosen by the local Stockfish;
  - one full game to the end at 1320 against max;
  - a restart of the `engine` container mid-think, after which the move still arrives.
- **Playwright:** start an engine game, move, and see the engine's reply and its name.
