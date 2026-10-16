## Why

The analysis board asked the engine only when Evaluate was pressed, so stepping through a game showed nothing, and the
library's games were a long list under the engine that made the page scroll.

## What Changes

- The position on the board is evaluated once it stays there 300 ms, and again when the think time changes; the
  Evaluate button is gone. Known positions answer from the shared cache.
- The analysis and study pages fit the screen (`wide fill`): the board (as large as the height allows), then the
  header, moves, engine and tools in a narrow column, then the library's games in a third column from `wide:` (1600px);
  between `shell:` and `wide:` the games sit under the engine. Each column scrolls on its own.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `engine-analysis`: the position shown is evaluated without a button.

## Impact

Frontend only: `components/studies.tsx` (`useAutoEvaluate`, `AnalysisBoard`), `components/library.tsx` (the games list
no longer scrolls by itself from `shell:` up), `styles.css` (`--breakpoint-wide`), the analysis e2e specs.
