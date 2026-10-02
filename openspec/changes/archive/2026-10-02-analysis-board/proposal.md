## Why

Engine analysis (Part 4b) exists only inside a study, so looking at one position means creating, naming and later
deleting a study. The owner asked on 2026-10-02 for an open analysis board: paste a position or a game, or open any
game, and analyse it at once. It is also the place the game library (`game-library`) opens its games and shows "this
position in famous games", so it comes first.

## What Changes

For a member:

- A new **Analysis** page (`/analysis`, in the navigation): a board, a move tree with variations, the engine panel
  (quick/normal/deep, best lines, click a line to play it), scores beside moves already evaluated, ← → and `f` as on
  the game page.
- Start from the standard position, a **pasted FEN** (checked before it is used), a **pasted PGN** (one game; several
  offer a picker), or **Analyse** on any of your games or any game being watched.
- Nothing is saved until **Save as study**, which creates a study from the tree (the existing studies endpoint).
- A position can be shared as a link (`/analysis?fen=…`).

In the code: frontend only. The study page's board-and-tree part becomes one `AnalysisBoard` component used by both
pages; the tree operations stay in `lib/studies.ts`; the engine stays `useAnalysis` + `AnalysisPanel`.

Part: 4 (study & analysis), follow-up. Out of scope: analysing a whole game in one go (a score for every move and a
graph), opening names and the library panel (both `game-library`), anything for signed-out visitors.

## Capabilities

### New Capabilities

- `analysis-board`: the open analysis page, its starting points (standard, FEN, PGN, a game), the unsaved tree, the
  shareable FEN link and Save as study.

### Modified Capabilities

- `studies`: "Analyse" on a finished game opens the analysis board with its moves instead of creating a study at once;
  Save as study there makes the study (the requirement that a finished game can become an owned study still holds).
  `POST /api/games/{id}/study` stays in the API.

## Impact

- Frontend: new `routes/_authenticated/analysis.tsx`; `components/studies.tsx` gains `AnalysisBoard` (extracted from
  `routes/_authenticated/studies.$id.tsx`); `lib/studies.ts` gains `fromFen` / `fromGame` starting trees and
  `isFen`; the game page's result panel and the Watch page get an Analyse link; navigation gets Analysis.
- Backend: none. `POST /api/analysis` and `POST /api/studies` are used as they are.
- Depends on `engine-analysis` (shared position cache) and `studies` (tree shape, PGN import).
