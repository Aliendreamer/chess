## Context

The engine worker (engine-play) runs Stockfish processes behind Kafka, one consumer loop per process, committing after
it produces. `analysis.requests` and `analysis.results` already exist (redpanda-init). Studies (studies) give the board
positions as FENs. The live relay pushes frames per topic over one browser socket each.

## Goals / Non-Goals

**Goals:** evaluate a position or a main line at a chosen think time; each position computed once per think time and
reused by everyone; results on the study board within the think time; analysis never slows play.

**Non-Goals:** analysis on the live game page (studies have "Analyse"), opening books or tablebases, cloud engines,
per-user quotas beyond the request cap, the openings explorer.

## Decisions

### D1 — The cache key

`PositionKey` = the FEN's first four fields (placement, side, castling, en passant), since the move counters do not
change the evaluation; normalised so an en-passant square without a possible capture is `-` (chess.js and our rules
library write it differently). Rows: `position_evaluations(PositionKey, ThinkMs, Status, Depth, Lines jsonb,
RequestedAt, EvaluatedAt)`, primary key `(PositionKey, ThinkMs)`. A lookup takes the longest finished evaluation with
`ThinkMs >=` the one asked for.

### D2 — Asking and answering

`POST /api/analysis { positions: [fen…] (1–300), think: "quick" | "normal" | "deep" }` → for each position, in order:
`{ key, evaluation | null }`. Positions with no usable evaluation and no request younger than
`Analysis:RetryAfterSeconds` (120) get a `requested` row and a message on `analysis.requests`
(`{ key, fen, thinkMs, multiPv: 3, requestedAt }`, keyed by the position key). The client repeats the call every 1.5 s
for what it still lacks; a repeat asks the worker nothing new unless a request has gone stale (lost).

### D3 — The worker

A second set of loops, `Engine:AnalysisProcesses` (default 1), group `chess.engine-analysis`, each with its own
Stockfish process (full strength, `MultiPV 3`, `Hash` from settings). `UciEngine.AnalyseAsync(fen, thinkMs, multiPv)`
sends `go movetime`, keeps the latest `info … multipv k score cp|mate … pv …` per k, and returns depth and lines at
`bestmove`. Scores are turned to White's side (Stockfish reports the side to move's). Same failure rules as play:
restart and retry once, drop a request older than `Engine:MaxRequestAgeSeconds`, commit after produce.

### D4 — Storing results

`AnalysisResultConsumer` on `analysis.results` (group `chess.analysis-results`) upserts the row as `done` with depth,
lines and `EvaluatedAt`. A late or duplicate answer only overwrites with an equal or deeper one.

### D5 — The board

A think selector (Quick / Normal / Deep), **Evaluate** (the current position) and **Analyse line** (the main line from
the current position to its end). The panel shows the current position's score, depth and three lines in SAN
(converted in the browser with chess.js from the UCI lines); clicking a line plays it into the tree as a variation.
The move tree shows each move's score once known. While positions are pending the board polls every 1.5 s and shows
"n of m analysed"; it stops when all are known or the page leaves.

## Risks / Trade-offs

- One big "Analyse line" at Deep (300 × 10 s = 50 min on one process) holds the analysis queue for others. The cap
  and `Engine:AnalysisProcesses` bound it; per-user fairness is a later change if it matters.
- Polling costs a request per 1.5 s per open board while waiting; it stops when done.
- Evaluations are public by design: nothing identifies who asked.
