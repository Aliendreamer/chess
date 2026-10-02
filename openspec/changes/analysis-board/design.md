## Context

`/studies/$id` already has everything an analysis board needs, but bound to a saved study: `MoveTree` (tree view with
variations), `AnalysisPanel` + `useAnalysis` (asks `POST /api/analysis`, polls every 1.5 s, keeps evaluations by
position key), the board with click/drag input, `lib/studies.ts` tree operations (`addMove`, `promote`, `remove`,
`nextPath`, `lineEnd`, `fenAt`, `playMove`) and `parsePgn` (one game per PGN game, SAN → UCI with chess.js). The game
page has `MoveNav`, ←/→ and `f`.

## Goals / Non-Goals

**Goals:**

- One page to analyse any position or game without creating anything.
- No second copy of the study board: both pages use one component.

**Non-Goals:**

- Whole-game analysis (every move scored, an evaluation graph): 60–80 engine jobs per game needs its own queueing
  design.
- Anonymous use; storing unsaved analysis between visits (beyond the URL's FEN).

## Decisions

1. **Extract `AnalysisBoard`, don't fork.** The board + tree + engine panel + navigation part of the study page moves
   into `components/studies.tsx#AnalysisBoard({ startFen, tree, onTreeChange, readOnly })`. The study page wraps it
   with title, saving, sharing and PGN; the analysis page wraps it with "start from" and "Save as study". Studies'
   e2e specs must stay green unchanged — that is the proof the extraction kept behaviour.
2. **The tree lives in the page.** `useState` holds `{ startFen, tree, path }`; the analysis page never writes to the
   server except the engine requests and Save as study. Leaving the page loses the analysis — said in the page, and
   Save as study is always one click away.
3. **Starting points through the URL.** `?fen=` (validated with chess.js; an invalid FEN shows an error and the
   standard start), `?game={id}` (the route loader fetches `GET /api/games/{id}/moves`, which already serves any game
   to any member, D20). A pasted PGN or FEN in the page replaces the tree after a confirm if the current tree has
   moves. `game-library` will add `?library={id}` the same way.
4. **Save as study** posts one `StudyInput` built from the tree (`toInput`) with a title from the source ("Analysis",
   "testuser vs player, analysis", the PGN's players) and navigates to the new study.
5. **Shareable link.** A "Copy link" button writes `/analysis?fen=<current position>` — a position, not the tree;
   trees can be long and are shared as studies.

## Risks / Trade-offs

- [Extracting the study board could change studies] → the extraction is its own commit with no behaviour change, the
  studies vitest and Playwright specs run before anything new is added.
- [Engine load from casual use] → every request goes through the existing shared cache (`position_evaluations`) and
  its retry window; a popular position is evaluated once for everybody.
