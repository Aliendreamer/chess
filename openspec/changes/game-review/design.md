## Context

`POST /api/analysis {fen, think}` answers one position from `position_evaluations` (PK `(PositionKey, ThinkMs)`, a
longer think answering a shorter request) or produces it to `analysis.requests`; the worker (`apps/engine`,
`Engine:AnalysisProcesses`, MultiPV `Analysis:Lines`, scores from White's side) answers on `analysis.results`, and
`AnalysisResultConsumer` stores it. A finished game's moves are in `rm_moves` (UCI, SAN, `FenAfter`) on the replica,
its status and result in `rm_games`. `openings` names positions by `PositionKey`; `Trainer/TrainerSchedule` is the
Leitner box (0–5, due after 0/1/3/7/14/30 days) of the opening trainer. The game page already walks a finished game
move by move (game-page-navigation).

## Goals / Non-Goals

**Goals:** a whole finished game evaluated on request, its mistakes named with the better move, and the member's own
mistakes practised until known — without slowing anyone's interactive analysis.

**Non-Goals:** reviewing every game automatically, accuracy scores, anything during play, puzzles from others' games.

## Decisions

1. **A review is the game's positions in the shared cache.** Nothing per game is stored but the request: the review
   is computed on read from `rm_moves` + `position_evaluations` at `Review:ThinkMs` (default 800 ms — apart from the board's 1/3/10 s, so a pending review
   row never makes a member's quick evaluation wait; any longer evaluation also counts). A position already evaluated (an opening, a game reviewed before, the analysis board) costs
   nothing. Complete = every position before a move has an evaluation; the final position is judged from the result
   (mate, stalemate, or the last evaluation for a resignation/time/agreement). A game nobody asked about reads `none`
   even when every position is cached (built: a review is the players' choice; asked, it completes at once).
2. **Reviews get their own topic.** `POST /api/games/{id}/review` produces every missing position to
   `analysis.review.requests` (same message as `analysis.requests`), marking them `Requested` in
   `position_evaluations` as `AnalysisService` does (a pending row younger than `Review:RetryAfterSeconds`, 900 s, is
   not asked again). The worker runs a separate loop and consumer group on it (`Engine:ReviewProcesses`, default 1;
   a review position may wait `Engine:MaxReviewAgeSeconds`, 1 h, where an interactive one is dropped after 120 s) and
   answers on `analysis.results`, where the existing consumer stores it. A member's position on the analysis board
   never waits behind a 90-move review.
3. **Who may start one.** Only a player of the game (or an Admin), only when `rm_games.Status` is
   `ended` (a game the replica has not seen end is 409: fair play, as for the analysis link). `game_reviews(GameId PK,
RequestedBy, RequestedAt)` records that a review was asked for (status `none` vs `running`). No daily limit (owner,
   2026-10-03: the club is mostly for personal use); asking again re-asks only lost positions. Anyone who can see the game can
   read its review.
4. **Classification is pure and lichess-like.** Winning chances `w(cp) = 2 / (1 + e^(-0.00368208·cp)) - 1` in
   [-1, 1] from the mover's side (mate = ±1). A move's loss is `w(best before) - w(after)` for the mover:
   ≥ 0.3 blunder, ≥ 0.2 mistake, ≥ 0.1 inaccuracy; the engine's first PV move is the better move, its line is shown.
   A move equal to the engine's first move is never marked. `Review/GameReview` holds it and is unit-tested.
5. **Where the game left the book.** The last ply whose position is in `openings` names the opening; the next move is
   the book exit, attributed to its player. When the member left the book, the panel links the trainer for that
   opening's family and colour.
6. **Reading a review.** `GET /api/games/{id}/review` → `{ status: none|running|complete, evaluated, positions,
moves: [{ ply, san, eval (cp|mate from White), best (uci, san), line, class }], counts: {white, black},
bookExit }`. The game page polls it every 2 s while `running` (as the study board polls analysis) and draws the
   graph and marks as evaluations arrive. `no-store` while running; `private, max-age=86400, immutable` once complete.
7. **Practice is per member, explicit.** `POST /api/games/{id}/review/practice` (a player of a complete review) adds
   that player's mistakes and blunders (not inaccuracies) to `mistake_drills(UserId, GameId, Ply)` PK, with `Fen`,
   `Played` (uci), `Accepted` (uci[]: the engine lines whose loss from the best is < 0.1), `Best` (uci + line),
   `Box`, `DueAt`, `UpdatedAt`; idempotent. `GET /api/practice/next` (the due position: lowest box, then oldest due,
   then newest added — the trainer's rule), `POST /api/practice/results {gameId, ply, correct}` (the trainer's
   schedule: correct = up a box, wrong = box 0 due now), `GET /api/me/practice` (counts: positions, learned, due).
   The browser checks the move against `Accepted`; the server stores only correct or not, as the trainer does.
8. **Where it shows.** The game page of a finished game: "Review with engine" (players), progress ("43 of 81
   positions"), the graph (`components/review.tsx`, SVG, no chart library; a click goes to that move), marks in the
   move list (?! ? ??), the better move and line beside the current move, the book exit, and "Practise my mistakes".
   `/practice` (one position, the member's side down, the game and move it came from, "Show answer"), a "Practice"
   nav entry (built without a due count: the shell would fetch it on every page), and a line on the member's own
   profile.

## Risks / Trade-offs

- [Engine time] → on demand only, players only, the shared cache, one review process by default; scale with
  `Engine:ReviewProcesses` (the review group and the analysis group together stay within the topics' partitions).
- [A 1 s evaluation is shallow] → enough to find mistakes worth practising (lichess's server review is similar); a
  deeper evaluation of the same position from the analysis board replaces it automatically.
- [Accepted moves] → only the engine's MultiPV lines (`Analysis:Lines`, 3) can be accepted; another good move is
  refused. The answer shows the engine's move, and the position comes back — acceptable for practice.
- [Review computed on every read] → ≤ a few hundred positions per game, one keyed query; complete reviews are cached
  by the browser for a day.
