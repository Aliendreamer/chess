## Why

Part 4, second half. On the study board a player wants the engine's opinion: of the position in front of them, or of
every move of a game, at a depth they choose. Evaluations are the same for everyone, so each is computed once and then
served from a cache (owner decision 2026-09-28: "cache by position is good, as it can be reused").

## What Changes

- **Three think times per position:** Quick 1 s, Normal 3 s and Deep 10 s (`Analysis:QuickMs`/`NormalMs`/`DeepMs`).
- **What an evaluation holds:** the depth reached and the engine's 3 best lines. Each line has a score from White's
  side (pawns, or mate in N) and its moves.
- **Two ways to ask:**
  - **Evaluate** the current position.
  - **Analyse line**: every position of the main line, from the start or from the current move to its end, up to 300.
- **Cache per position:**
  - `position_evaluations` is keyed by the position (the FEN without its move counters) and the think time.
  - A longer think answers a shorter request too.
  - Positions are not private, so every user reuses every evaluation.
  - A position already asked for, and still running, is not asked again.
- **The engine worker** answers on `analysis.requests` → `analysis.results` with its **own Stockfish processes**
  (`Engine:AnalysisProcesses`, default 1), full strength, MultiPV 3. Play keeps its own topics and processes, so
  analysis never delays a game against the computer.
- **The backend:**
  - `POST /api/analysis` takes up to 300 FENs and a think time. It answers at once with what is cached, and asks the
    worker for the rest.
  - `AnalysisResultConsumer` stores each answer.
  - The board asks again every 1.5 s for the positions it still waits for. This is polling, not the live relay: one
    relay socket per position would mean hundreds of sockets for a game, and a 1.5 s wait is invisible next to a 1–10 s
    think.
- **UI (the study board):**
  - A think-time choice, and the Evaluate and Analyse line buttons.
  - An evaluation panel for the current position: the score, the depth, and the 3 lines in SAN, each playable onto the
    board as a variation.
  - The score after each move in the move tree once known.
  - Progress while a line is analysed.

## Owner decisions

1. **Per position or a whole game:** the player chooses (2026-09-28).
2. **The cache is per position** and reused (2026-09-28).
3. **To confirm:** the think times Quick 1 s / Normal 3 s / Deep 10 s, 3 lines, at most 300 positions per request, and
   polling instead of the live relay.

## Capabilities

### New Capabilities

- `engine-analysis`: evaluating positions and lines at a chosen think time, the shared cache, and showing the results
  on the study board.

### Modified Capabilities

None.

## Impact

- **Engine worker:** analysis loops and a UCI "analyse" (MultiPV, `info` parsing), with tests.
- **Backend:**
  - `Analysis/` (the position key, the service, the result consumer, the `Analysis` settings) and a migration;
  - `WebApi/Analysis/`.
- **Frontend:** `lib/analysis.ts` (a score's text, lines to SAN, polling), the study board panel and move-tree scores.
- **Verify:** `verify-part4b.sh` (evaluate, then the cache answers; a line; an engine restart mid-analysis) and a
  Playwright spec.
