## Why

The owner wants opening theory (2026-10-03) and chose, of the options researched that day, an explorer built from the
club's own famous games: "we want only famous games anyway". The library already records every position each game
reached, so the moves played next are one query away. (Wikibooks theory text was dropped for thin coverage; lichess
master games may be added later as a second source; an opening trainer is a separate change.)

## What Changes

For a member:

- The analysis board's "In the library" panel gains a moves table: for the position on the board, every move played
  next in the library's games, with how many games, white wins / draws / black wins as a bar, and the opening name the
  move reaches when it has one. Clicking a move plays it on the board, so the explorer is walked move by move.
- It works from the start position too (every game's first move).
- The panel names its source: "World Championship games 1886–2024 (PGN Mentor)".

In the code: `GET /api/library/positions?key=` answers `moves` beside the games; the grouping is pure and tested; the
frontend turns each move into SAN from the current position.

Part: 6 (analysis, library). Out of scope: other game sources (lichess broadcasts, CC BY-SA — later), statistics by
rating or year, an opening trainer.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `game-library`: positions answer the moves played next with their results; the analysis board shows and plays them.

## Impact

- Backend: `Library/LibraryReads.cs` (`Explore`), `WebApi/Library/LibraryPosition/` (moves, the start position, names).
- Frontend: `lib/library.ts` (types, SAN), `components/library.tsx#PositionPanel` (moves table), the analysis page wires
  a click to the board.
