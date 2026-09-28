Each group ends in one commit passing its gate. 🐳 = live stack.

## 1. Owner review

- [x] 1.1 The owner confirms the proposal and design. Nothing is built before this.

## 2. Backend

- [x] 2.1 `Study` entity + migration; `Studies/StudyTree.cs` (validate + complete a tree with `ChessRules`, limits) and
      `StudyPgn` (export). Tests. Commit `feat(backend): studies with validated move trees`.
- [x] 2.2 Endpoints (`WebApi/Studies/…`: create/import, mine, get, update with version, share, delete, pgn) and
      `POST /api/games/{id}/study`. Tests. Commit `feat(backend): study endpoints`.
- [x] 2.3 🐳 Integration: import → edit → share → another user reads → private is 404 → from a game.

## 3. Frontend

- [x] 3.1 `lib/studies.ts` (tree ops, PGN → tree with pgn-parser + chess.js), server functions. Tests. Commit
      `feat(frontend): study model and pgn import`.
- [x] 3.2 `/studies`, `/studies/$id` (board, move tree, navigation, variations, save, share, download), nav item,
      "Analyse" on finished games. Tests. Commit `feat(frontend): studies`.

## 4. Verify and docs

- [ ] 4.1 🐳 `verify-part4a.sh` and a Playwright spec; the whole e2e suite. Commit `test(repo): verify studies`.
- [ ] 4.2 CLAUDE.md, architecture, ROADMAP; archive. Commit `docs(repo): studies`.
