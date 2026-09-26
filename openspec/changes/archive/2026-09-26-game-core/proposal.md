## Why

Part 1 is live games between people. Everything around a game (finding an opponent, lists and history,
presence) hangs off one thing: an authoritative game that validates moves, runs both clocks, and ends
correctly. This change builds that core, on the spine Part 0 proved: a sharded persistent actor, the journal
outbox into Kafka, and the live relay.

## What Changes

For a player:

- A game between two players can be played to the end.
- Each move is checked against the rules. Only the player to move can move, and only the two players can act
  at all.
- Both clocks run with the game's time control and increment. A player whose time runs out loses, unless the
  opponent can't mate, which makes it a draw. Our own outages never cost a player time.
- A game ends on checkmate, stalemate, insufficient material, threefold repetition or the 50-move rule, by
  resignation, or by an accepted draw. A game whose first moves aren't made within 1 minute is aborted.
- Anyone signed in can watch a game live. They get the current position immediately, then every move.

In the code:

- **Rules**: `Gera.Chess` 1.2.0 (D6), wrapped in our own `ChessRules`. The actor never touches the library
  directly.
- **`GameActor`**: a sharded, persistent actor, one per game, keyed by a Guid v7 (D11). It owns the board and
  both clocks (D13, D14). It persists `GameCreated`, `MoveMade`, `DrawOffered`, `DrawDeclined` and
  `GameEnded`, and snapshots every 20 events with the UCI move list so repetition survives recovery.
- **Commands over HTTP**:
  - `POST /api/games/{id}/moves`
  - `/resign`
  - `/draw/offer`, `/draw/accept`, `/draw/decline`
  - `/abort`
  - `GET /api/games/{id}/live`

  Each command answers with the actor's post-persist state.

- **Starting a game**: an internal `IGameStarter.StartAsync(white, black, timeControl)`. Changes 3
  (matchmaking and invites) call it. This change has no public "create game" endpoint.
- **Kafka**: every game event goes on `game.events`, keyed `game:{id}`. Each has a mapper and a
  `TopicTagger` entry.
- **Live**: a `game` kind on the relay (`GameLiveSource` + BFF allow-list). The actor publishes a `LiveFrame`
  after every persisted event.
- **Time controls**: the D12 presets as a `TimeControl` value (`initial + increment`, e.g. `5+3`).

**Part**: 1, change 1 of 4 (`game-core` → `game-read-side` → `matchmaking-and-invites` →
`presence-and-abandonment`). The UI follows the owner's Design work.

**Out of scope**:

- Finding an opponent and `open` games waiting for one: change 3.
- `rm_games`/`rm_moves`, lists and PGN: change 2. Until then a finished game's live snapshot wakes its actor;
  change 2 serves it from the replica.
- Presence and the 1-minute abandon flow: change 4.
- Ratings (D21), takebacks, Chess960, and any UI.

**ROADMAP decisions**: implements D6 and D12–D14, D18, D20, and the first-move part of D15. Depends on D5
(live relay), D10 (identity = `users.id`) and D11 (ids).

## Capabilities

### New Capabilities

- `game-play`: what a game guarantees. That covers who may act, move legality, clocks and increment, flag
  fall, failover forgiveness, every way a game ends, the first-move abort, what is persisted and published,
  and watching live.

### Modified Capabilities

- `realtime-relay`: the BFF allow-list gains the `game` kind. The requirement "Live state is addressed by
  topic kind and id" is extended with its id rule (a Guid v7).

## Impact

- **Backend**:
  - `Akka/Games/`: `GameActor`, messages, sharding, `GameLiveSource`, `IGameStarter`.
  - `Games/`: the `ChessRules` adapter, `TimeControl`, `SideCanMate`.
  - `Events/`: the game event records.
  - `Akka/Outbox/`: game mappers and `TopicTagger`.
  - `WebApi/Games/`: the thin command and live endpoints.
  - A new pinned package: `Gera.Chess` 1.2.0.
- **Frontend**: `live-relay.ts` `KINDS` gains `game` (Guid v7 id rule). No UI.
- **Tests**:
  - Unit: the rules adapter, `SideCanMate`, and `GameActor` under Akka TestKit with a virtual scheduler for
    clocks.
  - Integration: a two-player game over HTTP to checkmate, events on Kafka, the live snapshot through
    `LiveHub`, and failover forgiveness.
  - The integration test auth gains a per-request subject, so two players can act.
