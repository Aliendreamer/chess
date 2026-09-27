# Part 2 — experiment note (play vs the computer)

Closed on 2026-09-27. One change: `engine-play` (under `changes/archive/`). A human plays an untimed game against
Stockfish 19 at one of five levels, and the engine runs in its own container behind Kafka.

**Checks behind it:**

- Backend: 589 unit tests and 29 integration tests, 3 of them engine games on real Redpanda with a fake engine.
- Engine worker: 32 tests against a scripted fake engine.
- Frontend: 208 unit tests and 18 Playwright specs, one of them a game against the real engine through the UI.
- `verify-part2.sh`: 10 moves each at three levels, an engine restart mid-think, and a full game to checkmate.

## What worked

- **A separate worker, committing only after it answers.** The restart check shows it:
  1. the request was sent at :24.95;
  2. the worker was killed mid-think and back at :27.7;
  3. the new worker re-read the uncommitted request and answered at :34.0.

  The game's own 60 s re-ask was never needed.

- **The engine as a seeded player.** Names, PGN, game lists and the game page needed nothing new; an engine move is
  an ordinary `MakeMove` by the level's user, checked for turn and legality like anyone's.
- **Nothing new in the game journal.** The request consumer derives "the engine is to move" from the events it
  already gets, so the rule that every game event must reach `game.events` never had to bend.
- **Fakes at every layer:**
  - a scripted UCI channel for the worker;
  - a recording `IEngineRequests` for the actor;
  - a Kafka fake engine for the integration tests;
  - the same Stockfish binary playing the other side in the live check.

  Only the last one needs the real engine.

## What surprised us

- **The official Stockfish binary links against glibc,** so the engine image runs on a Debian base, not on Alpine like
  the backend.
- **At-least-once needed two extra guards:**
  - An old answer delivered again could arrive on a later engine turn and still be a legal move. Answers are now
    pinned to their ply (`MakeMove.AtPly`).
  - Deleting a finished game's `engine_games` row would let a replay of `game.created` ask the engine to move in a
    finished game. The row is kept, marked ended.
- **`PositionedProjection` only fits a consumer that handles every event type of an aggregate.** One that handles a
  few types leaves seq holes and stalls on its own gap check, so the request consumer keeps its own watermark.
- **Timers that meet:**
  - The first-move abort (1 min) and the engine's stall timer (60 s) fire together: a lost first request would have
    aborted the game before it was asked again. The abort now only runs while a person is to move.
  - In an untimed game, the abort branch of `Rearm` would have re-armed a timer that is already past due, forever.
    Untimed games get their own idle-passivation branch.
- **`UCI_Elo` is an engine scale.** It is calibrated against engines (CCRL 40/4 at 120 s + 1 s). The weakest level,
  "1320", beat full-strength Stockfish at 200 ms a move, so the levels are now shown as Casual … Maximum.
- **A topic that does not exist yet** makes a Kafka consumer fail. The integration fixture now creates the engine
  topics up front, like `redpanda-init` does in the stack.

## For Part 3 (correspondence games)

- **Already in place:** untimed games, and games that passivate when idle and recover unchanged. Correspondence
  deadlines can build on these.
- **Open from Part 2:**
  - levels a beginner can beat, which needs our own handicaps;
  - downloading Stockfish at build time instead of the local archive;
  - more than one engine process (`Engine:Processes`; the topic has 3 partitions).
- **Keep:** a `verify-partN.sh` on the live stack, and fakes at each layer so only one check needs the real
  dependency.
