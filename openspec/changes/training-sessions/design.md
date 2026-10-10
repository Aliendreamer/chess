## Context

Reused: `library_positions` (every position a library game reached, with `NextUci`), `position_evaluations` (shared
engine cache, MultiPV `Analysis:Lines` = 3, scores from White's side), the review request path
(`ReviewService`: request rows + `analysis.review.requests` at `Review:ThinkMs`), `GameReviewer` (winning chances,
the 0.1 tolerance that makes a move "accepted"), `mistake_drills` and `TrainerSchedule` (Leitner boxes 0–5).

## Decisions

### D1 Data

- `training_positions` (primary; written by the miner, read by everyone): `Id` uuid PK, `PositionKey` unique, `Fen`,
  `SideToMove`, `LibraryGameId`, `Ply` (the ply of the position, the master's move is ply+1), `MasterUci`,
  `AcceptedUci` text[], `BestLine` text[] (UCI), `Gap` real, `Eco`, `OpeningName`, `Phase` (`middlegame|endgame`),
  `White`, `Black`, `Event`, `Year`, `CreatedAt`. Indexes for the filters (`Phase`, `Eco`, trigram on names/opening).
- `training_candidates`: `PositionKey` PK, `Fen`, `LibraryGameId`, `Ply`, `MasterUci`, `Status`
  (`waiting|critical|quiet`), `RequestedAt`, `JudgedAt`. One row per position ever looked at.
- `training_progress`: PK (`UserId`, `PositionId`), `Box`, `DueAt`, `UpdatedAt`; private to the member.
- `training_synced`: PK (`UserId`, `GameId`), `SyncedAt`: a finished review copied into `mistake_drills` once.
- Phase: endgame when both queens are off or each side has at most 13 points of non-pawn, non-king material (Q9 R5
  B3 N3); otherwise middlegame. Positions before `Training:MinPly` (default 20) are never mined.

### D2 Auto-review

`AutoReviewConsumer` on `game.events` (group `chess.auto-review`, through `ProjectionRunner`): on `GameEnded` not
`Aborted` with ply ≥ 2 it starts the review as `ReviewService` does for the button, requested by a human player of the
game. Copying is lazy: `TrainingService.SyncAsync(user)` (run at the start of `next` and `summary` for mode `games`)
copies every complete review of the user's games without a `training_synced` row into `mistake_drills` (the existing
`PracticeFromGame` logic, insert-if-missing), then writes the marker.

### D3 Miner

`TrainingMiner` cluster singleton (`ActorNames.TrainingMiner = "training-miner"`, actor tracing conventions), every
`Training:MineSeconds` (10):

1. Judge: for its `waiting` candidates whose evaluation (`ThinkMs ≥ Review:ThinkMs`, done) exists: from the mover's
   side, gap = chances(line 1) − chances(line 2) (lichess winning chances, as `GameReviewer`). Critical when the
   position has ≥ 2 legal moves, 2 lines, and gap ≥ `Training:MinGap` (0.25) → insert `training_positions` with
   `AcceptedUci` = first moves of lines within 0.1 of the best (the practice tolerance) and `BestLine` = line 1's PV.
   Otherwise `quiet`. A candidate waiting longer than `Review:RetryAfterSeconds` × 4 is re-requested.
2. Top up to `Training:InFlight` (20) waiting: pick unvisited `library_positions` with `Ply ≥ MinPly` and a
   `NextUci`, random order, at most `Training:PerGame` (3) per library game overall; request evaluations through the
   review path (an evaluation already cached costs nothing).

### D4 Sessions (stateless; the page keeps the session)

Ids: mode `games` = `g:{gameId:N}:{ply}`, mode `library` = `p:{positionId:N}`.

`GET /api/training/next?mode=games|library&eco&phase=any|middlegame|endgame&player&from&to&exclude=id,id…` (≤ 100
excluded ids) → `{ item: TrainingItem | null, pool: number }`, `no-store`.

- `TrainingItem { id, mode, fen, sideToMove: 'white'|'black', box: number | null }`.
- `pool`: how many positions match (mode games: the member's mistakes).
- Order — games: due (oldest due first), then the rest by box ascending, oldest updated first. library: due matching
  progress rows, then new matching positions in random order. Filters apply to library only: `eco` matches an ECO
  prefix (`B9`, `B90`) or, otherwise, the opening name (ILIKE); `player` matches White or Black (ILIKE); `from`/`to`
  on `Year`.

`POST /api/training/answer { mode, id, uci }` → `TrainingVerdict`, `no-store`:
`{ correct, verdict: 'master'|'engine'|'both'|'none', masterUci: string|null, playedUci: string|null,
acceptedUci: string[], bestLine: string[], source: TrainingSource, box, dueAt, learned }`

- library: correct when `uci` = `MasterUci` (verdict master) or in `AcceptedUci` (engine), both → `both`.
  `source = { kind: 'library', libraryGameId, white, black, event, year, ply }`.
- games: correct when in `AcceptedUci` (`engine`), `playedUci` = the move played in the game,
  `source = { kind: 'game', gameId, ply, opponent }`.
- Leitner as `TrainerSchedule` (right = up a box, wrong = box 0 due now; learned from box 3); the first answer of a
  session is the one the page sends (the server does not dedupe within a session).

`GET /api/training/summary` → `{ games: { positions, learned, due }, library: { pool, seen, learned, due } }`.

All three: `SignedIn` policy, validators (mode allow-list, id format, uci `^[a-h][1-8][a-h][1-8][qrbn]?$`), page
size limits from `ApiOptions`, private to the member.

### D5 UI

`/training` (`fill` + `wide` layout), rail "Training" (replaces "Practice"); `/practice` redirects. Start panel: mode
(My games / Master games), filters (master games), length (10 / Endless), pool size, Start. Session: board left
(`usePracticeBoard`-style drill board), right: prompt, progress strip or running score, verdict with the master's move,
the engine's line (moves clickable onto the board) and the source, Next (Enter). Summary after 10: score, misses
(clickable), Another 10 / Change settings. Review panel: no "Practise my mistakes". Profile (own): a "Training" panel
from `/api/training/summary`.

## Risks

- Mining shares the review queue: `InFlight` bounds the wait a member's own review can see (~16 s).
- A library with few games past ply 20 gives a small pool; the start panel shows the pool so a member knows.
