## Context

Part 0 gives every piece this change needs:

- sharded persistent actors (`PingActor`: shard region, 5-minute passivation, snapshots every 20 events);
- the journal outbox (a `TopicTagger` entry plus a journal mapper per event type puts it on Kafka);
- conflict-safe projections;
- the generic live relay (`ILiveTopicSource` per kind, `LiveFrame` published to DistributedPubSub `live`).

Pings are the only aggregate so far. This change adds the first real one. ROADMAP D6 (Gera.Chess), D12–D15,
D18 and D20 are the decisions it implements.

## Goals / Non-Goals

**Goals:**

- One authoritative game per id that validates moves, runs both clocks, and ends by every D18 rule.
- Correct clocks under failover: no player loses time to an outage (D14).
- The game is visible on Kafka and on the live relay with no changes to either pipeline.
- The rules library stays behind one adapter.

**Non-Goals:**

- Creating games from user actions (change 3).
- Read models (change 2).
- Presence and abandonment (change 4).
- Ratings, takebacks, Chess960 and UI.

## Decisions

### D1. `ChessRules` adapter over Gera.Chess

`Games/ChessRules.cs` holds a Gera `ChessBoard` and exposes only what the actor needs:

- `TryApply(uci) → Applied(san, fenAfter, end?) | Rejected(reason)`;
- `Fen`;
- `SideToMove`;
- `Replay(IEnumerable<string> uci)`.

UCI is parsed into Gera's `Move(from, to)` plus a promotion piece. Gera's `EndGame` (`EndgameType`, `WonSide`)
maps to our `GameResult` and `EndReason`. `SideCanMate(board, side)` is our own helper: it's false for a lone
king or king plus a single minor piece, and true otherwise. The adapter is fully unit-tested, and the actor
never sees a Gera type.

_Alternative:_ calling Gera directly from the actor. Rejected, because every test would then depend on the
library's API, and a later switch (for example to ChessLib for Chess960) would touch the actor.

### D2. The board lives in memory; the move list is the record

A FEN is one position with no history, so it can't recreate a game or detect threefold repetition. The
canonical record is the **move list**. It's persisted move by move in `MoveMade` (UCI + SAN) and held in the
snapshot as UCI:
`GameSnapshot(created, uciMoves[], whiteMs, blackMs, status, drawOfferBy?, drawBlocked?)`.

UCI is unambiguous without a position (SAN is not), so recovery replays it through `ChessRules.Replay`: a few
hundred moves at most, in milliseconds. Snapshots are taken every 20 events, as for `PingActor`.

The FEN in each `MoveMade` is a cached view, so consumers can jump to "the position after move 20" without
replaying. **PGN** is the exchange format (export, analysis, Part 4 study). It's generated from the move list
when a game ends and stored with the finished game by change 2 (`rm_games`). ROADMAP D22 records this.

### D3. Events (all versioned `v1`, topic `game.events`, key `game:{id}`)

| Event          | Payload                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `GameCreated`  | white, black (`users.id`), time control (`initialMs`, `incrementMs`), at |
| `MoveMade`     | ply, uci, san, fenAfter, whiteMs, blackMs, at                            |
| `DrawOffered`  | by, at                                                                   |
| `DrawDeclined` | by, at                                                                   |
| `GameEnded`    | result (`1-0` / `0-1` / `1/2-1/2` / `*`), reason, whiteMs, blackMs, at   |

A lapsed offer (the opponent moved) isn't its own event, because `MoveMade` implies it. Each event type gets a
`TopicTagger.BoundTypes` entry and an `IJournalEventMapper`, which the outbox requires. The persistence id is
`game-{id:N}`.

### D4. Clocks inside the actor, driven by Akka timers

- **State:** `whiteMs`, `blackMs`, `turnStartedAt` (server clock via an injected `TimeProvider`).
- **On each accepted move:** the elapsed time is `now − turnStartedAt`, the mover's clock becomes
  `ms − elapsed + increment`, the turn switches, and the flag timer is re-armed for the new side's remaining
  time using `Timers.StartSingleTimer`.
- **When the flag timer fires:** the actor re-checks with `now`, and ends the game if the time really ran out.
  The re-check guards against stale timers. Otherwise it re-arms.
- **Before each side's first move:** no clock runs. A separate 1-minute abort timer runs instead (D15).
- **Recovery forgiveness (D14):** on `RecoveryCompleted` in `Playing`, `turnStartedAt = now` and the clocks
  are left exactly as the last event had them, then the timers are armed.

Tests use Akka TestKit's `TestScheduler` and a fake `TimeProvider`, so clocks are deterministic.

_Alternative:_ a `ClockActor` child. Rejected in the design talk: the clock changes on the same message as the
board.

### D5. States and commands

`Created` (both players known, White to make the first move) → `Playing` (after White's first move; Black's
first reply is also on the abort timer) → `Ended`.

Commands:

- `MakeMove(userId, uci)`
- `Resign(userId)`
- `OfferDraw(userId)`, `AcceptDraw(userId)`, `DeclineDraw(userId)`
- `Abort(userId)`
- `GetGameView`

Every command except the read validates that the sender is a player (D10). The reply is `GameView` on success,
or `GameRejected(code, reason)` with code `forbidden` (403), `illegal` (422) or `conflict` (409, e.g. not your
turn, game over, abort too late).

A new `Create(white, black, tc)` is idempotent per id: a second call with the same data returns the view. This
lets change 3 retry safely.

### D6. `IGameStarter`, not an endpoint

`IGameStarter.StartAsync(whiteId, blackId, TimeControl)` creates a Guid v7 and asks the region. Change 3 is its
only caller. Integration tests call it directly. No public "create game" endpoint exists until change 3
decides who may create what.

### D7. HTTP surface and live kind

The endpoints are thin FastEndpoints like the ping ones:

- `POST /api/games/{id}/moves` `{uci}`
- `POST /api/games/{id}/resign`
- `POST /api/games/{id}/draw/offer`, `/draw/accept`, `/draw/decline`
- `POST /api/games/{id}/abort`
- `GET /api/games/{id}/live`

They ask the region with a 5 s timeout and map `GameRejected` codes to HTTP. The user comes from
`ICurrentUser.Id`.

`GameLiveSource` (kind `game`, id a Guid `N` string) answers snapshots by asking `GetGameView`. The BFF
`KINDS` gains `game: /^[0-9a-f]{32}$/`.

`GameView` carries the clocks plus `clockAt` (the server time they were read at), so a client can count down
locally and correct itself on the next frame.

### D8. Passivation policy by game type

The sharding idle timeout counts only messages delivered through the shard, not an actor's own timer messages.
With the region default of 5 minutes, a classical game where a player thinks for more than 5 minutes would be
passivated mid-game, and its clock timers would die with it. So the `games` region runs with **idle
passivation off**, and each game decides for itself through a `PassivationPolicy` chosen from its time
control:

- **Live controls (D12, bullet to classical):** never passivate while `Created` or `Playing`. Passivate 1
  minute after `GameEnded` (`Context.Parent.Tell(new Passivate(...))`).
- **Correspondence (Part 3, days per move):** a later policy will passivate while waiting and rely on a persisted
  deadline to wake the game. The actor only asks the policy, so Part 3 adds a policy without changing the actor.

`RememberEntities` stays off.

**Risk (noted):** a live game whose node dies isn't recreated until a message arrives for it, so its flag
timer isn't running in between. See Risks.

## Risks / Trade-offs

- [A crashed node's live games are dormant until touched] Nothing recreates an entity after a node failure
  unless a message arrives. → This is expected. Any subscribe or `GetGameView` wakes the game and re-arms its
  timers, which a `game-core` test proves. Change 4 adds an in-game heartbeat over the live socket: when it
  stops being answered or the socket drops, the client shows "connection lost, reconnecting…" and
  re-subscribes, which wakes the game on a surviving node. Long term, `RememberEntities` for live games is an
  option.
- [Library behaviour drift] Gera's SAN or FEN formatting could change on upgrade. → The version is pinned
  exactly, and adapter tests pin the formats we rely on.
- [Clock skew between nodes] `turnStartedAt` comes from the node's clock. After a failover the new node's clock
  sets `now`. → Forgiveness (D14) restarts the turn on recovery anyway, so skew between nodes never charges a
  player.
- [Snapshot replay cost] A 300-ply game replays 300 moves on recovery. → That takes milliseconds, and snapshots
  cap the events that need replaying.

## Migration Plan

This is additive. It adds a new shard region `games` (persistence ids `game-*`), new event types on the
existing `game.events` topic, and a new live kind. Projections ignore unknown event types. Rollback means
redeploying the previous image, and games created in between become dormant journal rows.

## Open Questions

- The exact Gera API for promotion and SAN output is confirmed while writing the adapter tests (task 1). If it
  can't produce SAN with check marks, the adapter derives `+`/`#` from the board.
