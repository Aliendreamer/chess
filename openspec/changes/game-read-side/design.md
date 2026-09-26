## Context

`game.events` carries every game event: `game.created`, `game.move-made`, `game.draw-offered`,
`game.draw-declined` and `game.ended`, keyed `game:{id}` with the journal seq. Part 0 gives the projection
machinery:

- `KafkaConsumerHost` + `ProjectionRunner` (conflict retry, dead letters);
- `IdempotencyGuard` (skip / apply / gap);
- two watermark shapes: on the read row (`PingProjection`) or in `consumer_positions`.

Reads go to the replica through `ReadDbContext` (no tracking, no saves) with `Keyset` paging, which now takes
Guid tiebreaks (D11).

## Goals / Non-Goals

**Goals:** lists, "my games", summary, moves and PGN, all from the replica; exactly-once projection of every
game event; ended-game snapshots without waking actors.

**Non-Goals:**

- `open` games and invites (change 3);
- presence (change 4);
- UI and BFF loaders;
- ratings;
- display names.

## Decisions

### D1. One projection, watermark on `rm_games`

`GameProjection` handles all five event types for one aggregate, so it keeps its watermark on the aggregate's
own row: `rm_games.LastSeq`, a concurrency token, the shape `PingProjection` uses. `PositionedProjection<T>`
handles a single event type, so it doesn't fit.

`game.created` inserts the `rm_games` row (seq 1) and the two `rm_game_players` rows. Every later event loads
the row, runs `IdempotencyGuard`, stages its effect, and saves once. A gap throws `ProjectionGapException`. A
row missing for seq > 1 is also a gap.

The envelope is parsed once as `EventEnvelope<JsonElement>`, and the payload is deserialized by `type`. An
unknown `type` is ignored, like a foreign event.

### D2. Tables

| Table             | Key                | Columns                                                                                                                                            | Indexes                                      |
| ----------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `rm_games`        | `GameId` uuid      | WhiteId, BlackId, TimeControl, Status (`playing` / `ended`), Result?, Reason?, Ply, LastFen, CreatedAt, EndedAt?, UpdatedAt, LastSeq (token), Pgn? | `(Status, UpdatedAt, GameId)` for the lists  |
| `rm_game_players` | `(UserId, GameId)` | Color, OpponentId, CreatedAt                                                                                                                       | `(UserId, CreatedAt, GameId)` for "my games" |
| `rm_moves`        | `(GameId, Ply)`    | Uci, San, FenAfter, WhiteMs, BlackMs, At                                                                                                           | the PK serves ply order                      |

- **Status:** a game is `playing` from creation. An aborted game is `ended` with result `*`.
- **"Most recently active":** `UpdatedAt` is the time of the last event. The playing list orders by it, and
  the ended list by `EndedAt`, which equals `UpdatedAt` once ended.
- **Why `rm_game_players` exists:** a user plays as either colour, so "my games" from `rm_games` alone would
  need `WhiteId = me OR BlackId = me`, two index scans that keyset paging can't seek through. One row per player
  makes it a single seek. `OpponentId` and `Color` are copied onto it so the list needs no join.

### D3. PGN built from SAN, when the game ends

`Games/Pgn.cs` is a pure function of the headers and the SAN list. It writes:

- the seven-tag roster, plus `TimeControl` (PGN seconds form, e.g. `300+3`) and `Termination` (`normal`,
  `time forfeit`, `abandoned`);
- the movetext, numbered `1. f3 e5 2. g4 Qh4# 0-1`, with lines wrapped at 80 columns.

When `game.ended` is projected, the moves already on the primary are read in ply order, the PGN is built, and
it's stored on `rm_games.Pgn` in the same transaction. This is ROADMAP D22's "generated when a game ends,
stored with the finished game". It doesn't use the rules library, so PGN stays independent of Gera.Chess.

Player names are `Player {users.id}` until profiles exist (open question 1). Emails never go into PGN.

### D4. Read endpoints on the replica

The endpoints are thin, like `ListPingsEndpoint`:

| Endpoint                        | Keyset / order                             | Notes                                                |
| ------------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| `GET /api/games?status=playing` | `(UpdatedAt, GameId)`                      |                                                      |
| `GET /api/games?status=ended`   | `(UpdatedAt, GameId)`                      | `UpdatedAt` = `EndedAt` once ended                   |
| `GET /api/me/games`             | `(CreatedAt, GameId)` on `rm_game_players` | user from `ICurrentUser`                             |
| `GET /api/games/{id}`           | —                                          | summary; 404 unknown                                 |
| `GET /api/games/{id}/moves`     | —                                          | all moves in ply order (a few hundred rows at most)  |
| `GET /api/games/{id}/pgn`       | —                                          | `application/x-chess-pgn`; 404 unknown or unfinished |

A replica failure returns 503, like the ping list. The OpenAPI descriptions say "eventually consistent".

### D5. Ended-game snapshots from the replica

`GameLiveSource.SnapshotAsync` first reads `rm_games` on the replica. If the row is `ended`, it builds the
`GameView` from the row and returns it, with seq = `LastSeq`, without asking the region. Otherwise it asks the
actor as today.

Right after an ending, the replica may not have it yet, so the actor answers. It's still in memory, since it
passivates only 1 minute after the end. The row lacks only `DrawOfferedBy` (always null once ended) and
`ClockAt` (set to `EndedAt`), so the view is complete.

## Risks / Trade-offs

- [Lists lag the game by the replication delay] Measured ~250–500 ms in Part 0. → That's acceptable for lists.
  The live page uses the actor while a game is live.
- [PGN depends on moves being projected before the ending] `game.ended` has a higher seq than every move, and
  the guard applies in seq order, so all moves are on the primary when the PGN is built. → A test proves it,
  including after a replay.
- [Many small rows] ~80 `rm_moves` rows per game. → The PK is `(GameId, Ply)`. Partitioning (`pg_partman`,
  already installed) is a later concern.

## Migration Plan

This is additive: one migration creates the three tables. The new consumer group starts from `earliest`, so
games played since `game-core` shipped are projected on first start. Rollback means redeploying the previous
image; the tables are then simply unused.

## Open Questions

1. **Player display names** in PGN and lists: until profiles exist, `Player {id}`. Do we want a `DisplayName`
   on `users` (from Keycloak `preferred_username`?) in this change, or later?
