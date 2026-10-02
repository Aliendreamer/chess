## 1. Schema and openings

- [x] 1.1 Entities `LibraryGame`, `LibraryPosition`, `Opening` (one class per file, `Data/Models` + configurations),
      `pg_trgm` extension and indexes; migration `./build_migration.sh "AddGameLibrary"`; `ReadDbContext` maps the three
      read-only. `dotnet build` warning-clean.
- [x] 1.2 Commit `apps/backend/Library/Openings/{a..e}.tsv` (lichess `chess-openings`, CC0, embedded) and an
      ATTRIBUTION line. Failing
      unit test: `OpeningSeed.Parse` replays a TSV row ("C67 Ruy Lopez: Berlin Defense, 1. e4 e5 2. Nf3 Nc6 3. Bb5
      Nf6 4. O-O") to its position key and ply. Implement + the startup seed (only when empty, advisory lock).

## 2. Import

- [ ] 2.1 Failing unit tests for `Library/LibraryImport` (pure): a legal game → positions for every ply and its deepest
      opening; an illegal move → refused with the move; a FEN start → refused; the dedupe key ignores name case and
      spacing; `year` from `1886.??.??`, `1972.07.11`, `????.??.??`. Implement on `ChessRules` + `PositionKey`.
- [ ] 2.2 `WebApi/Admin/ImportLibrary/` (`Roles(Admin)`, ≤100 games, one transaction, per-game outcome). Commit:
      `feat(backend): the game library and its import`.
- [ ] 2.3 🐳 Integration test: import 3 games (new, duplicate, illegal) → outcomes; the stored game has its positions
      and opening; a non-admin gets 403 (`nx integration-test backend`).

## 3. Reads

- [ ] 3.1 Failing unit tests for the search filters (`LibraryReads`, pure over `IQueryable`): player either colour and
      any case, year range, WC flag, ECO, result; keyset order `(year desc, id)`.
- [ ] 3.2 `WebApi/Library/` search, game, position (games + W/D/B counts), opening; replica; cache headers. Commit:
      `feat(backend): library search, positions and openings`.
- [ ] 3.3 🐳 Integration test: after an import, search by player and by ECO finds it; its third position lists it with
      the ply; the opening endpoint names it.

## 4. Frontend

- [ ] 4.1 `parsePgn` passes Event/Site/Round/ECO through (failing vitest first); `lib/library.ts` (types, query
      building), `lib/server/library.ts` (paths, 404 → null) with tests; server functions.
- [ ] 4.2 Admin: Import to library (file, source, licence, WC checkbox), batches of 100 with progress and per-game
      outcomes (component test with a fake import). Commit: `feat(frontend): import to the library`.
- [ ] 4.3 `/library` (filters as URL search params, results with opening and attribution, Load more, About sources) and
      `?library={id}` on the analysis board; Library in the navigation. Commit: `feat(frontend): the game library`.
- [ ] 4.4 Analysis board: opening name of the current position, In the library panel (games, W/D/B, open at that ply)
      — component tests for the panel. Commit: `feat(frontend): famous games at every position`.
- [ ] 4.5 🐳 Playwright `e2e/library.spec.ts`: testuser imports a small PGN (two games, one illegal) as admin; searches
      by player; opens a game on the analysis board; the In the library panel lists it at a middle position.

## 5. First fill and docs

- [ ] 5.1 `tools/library/SOURCES.md`: the planned imports (PGN Mentor WC 1886–2024 and Candidates, lichess broadcasts
      2021–2026 title matches, a hand-picked classics list), each with URL, licence, kind. 1993–2004 marked "waiting for
      the Caissabase licence check".
- [ ] 5.2 👤 Owner/admin runs the first imports on the local stack and spot-checks a few games per decade.
- [ ] 5.3 CLAUDE.md (library tables, import rules, never commit PGN collections, attribution) and Serena memory.
      Commit: `docs(repo): game-library`.
