## 1. Extract the study board (no behaviour change)

- [x] 1.1 Move the board + tree + engine panel + navigation of `routes/_authenticated/studies.$id.tsx` into
      `components/studies.tsx#AnalysisBoard`; the study page wraps it. Failing first: a component test rendering
      `AnalysisBoard` with a two-move tree (fails: no such export). `nx run-many -t lint test -p frontend` green.
      Commit: `refactor(frontend): the study board as AnalysisBoard`.
- [x] 1.2 🐳 `e2e/studies.spec.ts` and `e2e/analysis.spec.ts` unchanged and green (`tools/e2e.sh`) — the extraction
      kept behaviour.

## 2. Starting points

- [x] 2.1 Failing vitest in `lib/studies.test.ts`: `isFen` (legal, illegal, missing fields), `fromGame(moves)` builds a
      main line from a game's UCI moves, `titleFor` names the saved study by its source. Implement.

## 3. The page

- [x] 3.1 `routes/_authenticated/analysis.tsx`: `?fen=` and `?game=` (loader fetches the moves), paste FEN / paste PGN
      (game picker when several), Save as study (`postCreateStudies`, then open it), Copy link; Analysis in the
      navigation (`Microscope` icon); the game page's Analyse opens the board (finished games only — no Analyse on
      Watch boards: their games are in play). `pnpm generate-routes`; gate
      green. Commit: `feat(frontend): the analysis board`.
- [x] 3.2 🐳 Playwright `e2e/analysis-board.spec.ts`: open with a FEN, play a move, ask the engine (quick) and see a
      score; paste a broken FEN and see the error; open a finished game's Analyse and see its moves; Save as study opens
      the new study. `tools/e2e.sh`.

## 4. Docs

- [x] 4.1 CLAUDE.md Studies note (AnalysisBoard shared, `/analysis`). Commit: `docs(repo): analysis-board`.
