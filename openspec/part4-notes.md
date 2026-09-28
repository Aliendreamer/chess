# Part 4 — experiment note (study and analysis)

Closed on 2026-09-28. Two changes, both under `changes/archive/`:

- **`studies`:** PGN import by paste or file (variations kept), a board with saved variations, sharing by link, a
  study from a finished game, and PGN export.
- **`engine-analysis`:** evaluate a position or a whole line on the study board at Quick, Normal or Deep (1, 3 or
  10 s). The engine gives three best lines and a score for each move. Evaluations are cached per position and shared
  by everyone.

**Checks behind it:**

- Backend: 667 unit tests and 34 integration tests. One integration test is the analysis round trip on real
  Redpanda: a request, a fake engine's answer, and a second request served from the cache with no new request.
- Engine worker: 45 tests, including MultiPV parsing and White's-side scores.
- Frontend: 245 unit tests and 21 Playwright tests. A study is imported, analysed along its line, scored move by move,
  and an engine line is played into it.
- `verify-part4a.sh` and `verify-part4b.sh` on the stack. `verify-part4b.sh` picks a random rook ending, so a run
  really reaches the engine rather than the cache.

## What worked

- **A study is just a row.** No actor, no events, no projection: the owner's own data, read and written on the
  primary. The server replays every line and keeps its own SAN and FEN, so the browser's chess.js stays feedback only,
  as in games.
- **The cache is keyed by position, not by study.** The same position from any game, study or user is evaluated once
  per think time. A longer think answers a shorter request, so a Deep evaluation also serves Quick.
- **The API never waits for the engine.** It answers from the cache, asks for the rest, and the board polls. That kept
  the endpoint an ordinary request with no timeouts to tune, and a lost request is simply asked for again.
- **Part 2's worker carried over.** Analysis is one more loop in the same container, with its own processes and
  consumer group, so it cannot delay an engine game's move. The "commit after produce" rule came along unchanged.

## What surprised us

- **chess.js drops PGN variations.** Import uses `@mliebelt/pgn-parser` and plays the SAN with chess.js. The parser
  gives the `Date` tag as an object, and its types package cannot be resolved, so the move type is derived from
  `ParseTree`.
- **Two libraries, two FENs for one position.** chess.js writes the en-passant square only when a capture is
  possible; the rules library writes it after every double step. The cache key keeps the square only when a pawn can
  take there, and `lib/analysis.ts` mirrors the rule, or the board would never find its scores.
- **Text typed before hydration was lost.** The import textarea is controlled, and a fast user (or Playwright) typed
  before React took over. It now adopts what is already in the field on mount.
- **Depth is not quality.** A rook ending reached depth 81 in 3 s (Stockfish sees the forced mate), while an opening
  gets about 20. The panel shows depth as a fact, not a grade.
- **`dotnet watch` in the dev container died on a hot reload** while files were edited in bulk. backend-1 exited;
  backend-2 kept the stack answering. A restart was enough.
- **`set -e` with `pipefail` ends a polling loop** on the first empty answer. Polling lines in the verify scripts
  need `|| true`.

## Open, for later

- **One big Deep line holds the analysis queue** (300 positions × 10 s = 50 minutes on one process). The position cap
  and `Engine:AnalysisProcesses` bound it; per-user fairness or cancelling a request is a later change if it matters.
- The openings explorer from imported games.
- Evaluations are never evicted; the table grows with every new position analysed.
- Downloading Stockfish at image build time instead of keeping the binary in the repo (from Part 2).
- Engine levels a beginner can beat (from Part 2).
