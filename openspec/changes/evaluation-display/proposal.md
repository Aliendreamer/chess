## Why

The owner, 2026-10-25: while playing Stockfish and on the analysis board, a player wants to see the evaluation — a
bar beside the board and the engine's best moves — each switched on or off with a tick box, in the desktop app and in
the club. While playing, the desktop's evaluation is a second Stockfish next to the one played, so the player is told
what it costs.

## What Changes

- **Tick boxes under the board**: "Evaluation bar" and "Best moves". On the analysis board both start ticked; in a game
  against the computer both start unticked. Each is kept with the player's preferences.
- **Evaluation bar** beside the board: White's winning chances (lichess's logistic), turned with the board, the score
  as its name.
- **Best moves**: the engine's lines (three), each with its score and moves in SAN. On the analysis board this is the
  engine panel (think time and lines); while playing, a list under the tick boxes at the quick think.
- **Only against the computer**: a game against a person never shows the tick boxes or the evaluation; in the club only
  the person playing the engine game sees them.
- **Desktop warning**: while either box is ticked in a game, a note says a second Stockfish keeps a processor core busy.
- With both boxes unticked the engine is not asked.

## Capabilities

### New Capabilities

- `evaluation-display`: the tick boxes, the bar, the best moves, and where they appear.

### Modified Capabilities

- `user-preferences`: four engine switches (`analysisBar`, `analysisLines`, `playBar`, `playLines`).

## Impact

- **Backend:** `Authentication/Preferences.cs` (four booleans with defaults; a stored row without them reads with the
  defaults), `PutPreferencesRequest` (nullable: an older page saving its themes keeps them).
- **Libraries:** `@chess/core` `Preferences` + `withDefaults`; `@chess/ui` `EvalBar`, `EngineLines`, `EvaluationTicks`,
  `AnalysisBoard`'s optional `shown`/`onShown`, `useAnalysis`'s starting think, `useAutoEvaluate`'s `enabled`.
- **Frontend:** `/analysis` and `/games/$id` (engine games); e2e in `analysis-board`, `engine` and `play` specs.
- **Desktop:** the game page and the analysis page; preferences read completed with the defaults.
