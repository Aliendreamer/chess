## 1. Backend

- [x] 1.1 Failing unit tests for `LibraryReads.Explore` (grouping per next move, W/D/B, most played first, a game
      ending here adds nothing, the start position). Implement.
- [x] 1.2 `GET /api/library/positions` answers `moves` (start position: all games; names of the positions reached).
      Commit: `feat(backend): moves played from a library position`.
- [x] 1.3 🐳 Integration test (extend `LibraryFlowTests`): the imported game's position lists its next move.

## 2. Frontend

- [x] 2.1 Failing component tests: the moves table (SAN, counts, bar, opening name), a click calls back with the UCI.
      Implement; the analysis page plays the move. Commit: `feat(frontend): the library explorer on the board`.
- [x] 2.2 🐳 Playwright: at the start position the table lists 1.e4 among the moves; clicking it plays it and the table
      shows Black's replies (needs the imported library; `e2e/library.spec.ts`).

## 3. Docs

- [x] 3.1 ROADMAP (explorer built; lichess master games later; Wikibooks dropped; trainer to design), CLAUDE.md
      library note. Commit: `docs(repo): library-explorer`.
